import os, glob, joblib, numpy as np, pandas as pd, argparse, json
from datetime import datetime
from typing import Tuple
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.model_selection import GroupKFold, RandomizedSearchCV
from sklearn.metrics import accuracy_score
from xgboost import XGBClassifier

os.environ.setdefault("TK_SILENCE_DEPRECATION", "1")
PLOT_MODE = "auto"
PLOTS_DIR = None

import matplotlib
try:
    try:
        matplotlib.use("MacOSX")
    except Exception:
        matplotlib.use("TkAgg")
except Exception:
    matplotlib.use("Agg")  # headless fallback (no windows)

import matplotlib.pyplot as plt
plt.ion()


# =============================
# Defaults / Config
# =============================
HERE = os.path.abspath(os.path.dirname(__file__))
if PLOTS_DIR is None:
    PLOTS_DIR = os.path.join(HERE, "figures")

DATA_DIR = os.path.join(HERE, "datasets")
OUT_PKL = os.path.join(HERE, "final_hybrid_threat_model_daily.pkl")
OUT_COMBINED = os.path.join(HERE, "final_combined_dataset.csv")
OUT_TOPK = os.path.join(HERE, "top_scored_test_samples.csv")
OUT_TEST_PREDS = os.path.join(HERE, "test_predictions_with_scores.csv")
OUT_FEATURE_IMPORTANCE = os.path.join(HERE, "feature_importances.csv")

LABEL = "predicted_threat_label"

BASE_FEATURES = [
    'number_of_emails_dispatched', 'number_of_files_interacted', 'total_logon_attempts',
    'usb_connection_incidents', 'nighttime_email_events', 'number_of_night_logons',
    'trait_openness_score', 'trait_conscientiousness_score', 'trait_extraversion_score',
    'trait_agreeableness_score', 'trait_neuroticism_score',
    'weekday_index', 'is_weekend_day',
    'email_volume_change_1d', 'logon_variation_1d', 'logon_rolling_average_7d',
    'logon_to_email_event_ratio', 'usb_to_logon_ratio', 'file_to_email_ratio',
    'email_volume_volatility_3d', 'logon_volatility_3d'
]

ROLL_WINDOWS = [7, 14, 30]
IFOREST_CONTAM = 0.03

# Precision-first selection targets (evaluation view)
DEFAULT_P_AT_K_VALUES = [5, 10, 25, 50, 100, 200]  # (kept for plotting, but we won't print P@K)
DEFAULT_ALERT_RATE = 0.001     # 0.1% of test as alert budget threshold
DEFAULT_TOPK_EXPORT = 200      # rows to export for manual review

# will be set from CLI
NO_PLOTS = False
FAST = False

# =============================
# Plot helpers
# =============================
def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def _safe_name(s: str) -> str:
    bad = '<>:"/\\|?*'
    for ch in bad:
        s = s.replace(ch, "_")
    return s.replace(" ", "_")

def _show_now(title: str = "figure"):
    """
    Show or save the current matplotlib figure depending on PLOT_MODE/backends.
    This does NOT change training behaviour.
    """
    global PLOT_MODE, PLOTS_DIR
    fig = plt.gcf()

    if NO_PLOTS or PLOT_MODE == "none":
        plt.close(fig)
        return

    backend = matplotlib.get_backend().lower()

    # Decide behavior for "auto"
    mode = PLOT_MODE
    if PLOT_MODE == "auto":
        non_interactive = ("agg", "pdf", "svg", "ps", "cairo")
        mode = "save" if any(b in backend for b in non_interactive) else "show"

    if mode == "show":
        try:
            plt.show(block=False)
            plt.pause(1.0)
        except Exception:
            mode = "save"
        else:
            plt.close(fig)

    if mode == "save":
        try:
            _ensure_dir(PLOTS_DIR)
            try:
                plt.tight_layout()
            except Exception:
                pass
            fname = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{_safe_name(title)}.png"
            out_path = os.path.join(PLOTS_DIR, fname)
            fig.savefig(out_path, dpi=160, bbox_inches="tight")
            print(f"🖼️  Saved plot -> {out_path}")
        except Exception as e:
            print(f"(could not save plot: {e})")
        finally:
            plt.close(fig)

# =============================
# Data & feature helpers
# =============================
def load_all_csvs(data_dir: str) -> pd.DataFrame:
    print(f"📂 Reading CSVs from: {data_dir}")
    paths = sorted(glob.glob(os.path.join(data_dir, "*.csv")))
    if not paths:
        raise FileNotFoundError(f"No CSV files found in {data_dir}")
    frames = []
    for p in paths:
        df = pd.read_csv(p)
        df.columns = [c.strip() for c in df.columns]
        frames.append(df)
        print(f"Loaded {os.path.basename(p)} with {len(df):,} rows")
    big = pd.concat(frames, ignore_index=True)
    print(f"\n✅ Combined rows: {len(big):,} from {len(frames)} files\n")
    return big

def clip_and_coerce(df: pd.DataFrame, cols) -> pd.DataFrame:
    for c in cols:
        df[c] = pd.to_numeric(df[c], errors='coerce').astype('float64')
        df[c] = df[c].replace([np.inf, -np.inf], np.nan)
    for c in ['logon_to_email_event_ratio', 'usb_to_logon_ratio', 'file_to_email_ratio']:
        if c in df.columns:
            df[c] = df[c].clip(0, 50)
    return df

def add_time_flags(df: pd.DataFrame) -> pd.DataFrame:
    dt = pd.to_datetime(df['timestamp'], errors='coerce')
    df['hour'] = dt.dt.hour
    df['month'] = dt.dt.month
    df['is_business_hours'] = ((df['hour'] >= 8) & (df['hour'] <= 18)).astype(int)
    df['is_late_night'] = ((df['hour'] <= 5) | (df['hour'] >= 23)).astype(int)
    return df

def add_user_rolling(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(['user', 'timestamp'])
    bases = ['number_of_emails_dispatched','total_logon_attempts',
             'number_of_files_interacted','usb_connection_incidents']
    for w in ROLL_WINDOWS:
        for col in bases:
            df[f'{col}_mean_{w}d'] = df.groupby('user')[col].transform(lambda x: x.rolling(w, min_periods=1).mean())
            df[f'{col}_std_{w}d']  = df.groupby('user')[col].transform(lambda x: x.rolling(w, min_periods=1).std()).fillna(0.0)
        df[f'email_delta_{w}d'] = df['number_of_emails_dispatched'] - df[f'number_of_emails_dispatched_mean_{w}d']
        df[f'logon_delta_{w}d'] = df['total_logon_attempts'] - df[f'total_logon_attempts_mean_{w}d']
    return df

def _mad(x: pd.Series) -> float:
    med = np.median(x)
    return np.median(np.abs(x - med))

def add_user_robust_zscores(df: pd.DataFrame) -> pd.DataFrame:
    bases = ['number_of_emails_dispatched','total_logon_attempts',
             'number_of_files_interacted','usb_connection_incidents']
    eps = 1e-6
    for col in bases:
        med = df.groupby('user')[col].transform('median')
        mad = df.groupby('user')[col].transform(_mad).fillna(0.0)
        denom = 1.4826 * mad + eps
        df[f'user_rz_{col}'] = (df[col] - med) / denom
    return df

def add_night_ratio(df: pd.DataFrame) -> pd.DataFrame:
    total = df['number_of_emails_dispatched'] + df['total_logon_attempts']
    df['night_activity_ratio'] = (df['nighttime_email_events'] + df['number_of_night_logons']) / (total + 1.0)
    return df

def add_interactions(df: pd.DataFrame) -> pd.DataFrame:
    df['after_hours_logon_ratio'] = (df['number_of_night_logons'] / (df['total_logon_attempts'] + 1.0)).clip(0, 1)
    df['files_per_logon'] = (df['number_of_files_interacted'] / (df['total_logon_attempts'] + 1.0)).clip(0, 100)
    df['usb_after_hours'] = (df['usb_connection_incidents'] * df['is_late_night']).astype(float)
    df['neuroticism_x_night'] = df['trait_neuroticism_score'] * df['night_activity_ratio']
    return df

def precision_at_k(y_true: np.ndarray, scores: np.ndarray, k: int) -> float:
    if k <= 0:
        return 0.0
    k = min(k, len(scores))
    idx = np.argpartition(scores, -k)[-k:]
    top_sorted = idx[np.argsort(scores[idx])[::-1]]
    sel = y_true[top_sorted].astype(int)
    return float(sel.sum()) / float(k)

def precision_at_rate(y_true: np.ndarray, scores: np.ndarray, rate: float) -> Tuple[float, int]:
    n = len(scores)
    k = max(1, int(np.ceil(n * rate)))
    return precision_at_k(y_true, scores, k), k

def print_quantiles(scores: np.ndarray, label: str):
    qs = np.quantile(scores, [0.50, 0.90, 0.95, 0.99, 0.995, 0.999])
    print(f"\nScore quantiles ({label}): 50% {qs[0]:.4f} | 90% {qs[1]:.4f} | 95% {qs[2]:.4f} | "
          f"99% {qs[3]:.4f} | 99.5% {qs[4]:.4f} | 99.9% {qs[5]:.4f}")

# ---------- Plotting helpers (unchanged visuals; we won't print extra metrics) ----------
def _show_confusion_heatmap(cm, title="Confusion Matrix"):
    fig, ax = plt.subplots(figsize=(4.6, 4.1))
    ax.imshow(cm, interpolation="nearest")
    ax.set_title(title)
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual")
    ax.set_xticks([0,1]); ax.set_xticklabels(["0","1"])
    ax.set_yticks([0,1]); ax.set_yticklabels(["0","1"])
    for (i,j), v in np.ndenumerate(cm):
        ax.text(j, i, f"{v}", ha="center", va="center")
    plt.tight_layout()
    _show_now(title)

def _show_roc_pr(y_true, scores, title_prefix=""):
    from sklearn.metrics import precision_recall_curve, roc_curve
    # ROC
    try:
        fpr, tpr, _ = roc_curve(y_true, scores)
        fig, ax = plt.subplots(figsize=(5.0, 4.2))
        ax.plot(fpr, tpr)
        ax.plot([0,1],[0,1], linestyle="--")
        ax.set_title(f"{title_prefix} ROC Curve")
        ax.set_xlabel("False Positive Rate"); ax.set_ylabel("True Positive Rate")
        plt.tight_layout()
        _show_now(f"{title_prefix}_ROC")
    except Exception as e:
        print(f"(ROC not available: {e})")
    # PR
    try:
        p, r, _ = precision_recall_curve(y_true, scores)
        fig, ax = plt.subplots(figsize=(5.0, 4.2))
        ax.plot(r, p)
        ax.set_title(f"{title_prefix} Precision–Recall Curve")
        ax.set_xlabel("Recall"); ax.set_ylabel("Precision")
        plt.tight_layout()
        _show_now(f"{title_prefix}_PR")
    except Exception as e:
        print(f"(PR not available: {e})")

def _show_score_hist(scores, title="Score Distribution"):
    fig, ax = plt.subplots(figsize=(5.0, 4.2))
    ax.hist(scores, bins=60)
    ax.set_title(title)
    ax.set_xlabel("Predicted Probability"); ax.set_ylabel("Count")
    plt.tight_layout()
    _show_now(title)

def _show_score_quantiles(scores):
    qs = np.quantile(scores, [0.5, 0.9, 0.95, 0.99, 0.995, 0.999])
    fig, ax = plt.subplots(figsize=(5.5, 3.6))
    ax.hist(scores, bins=60)
    for q in qs:
        ax.axvline(q, linestyle="--")
    ax.set_title("Score Distribution with Key Quantiles")
    ax.set_xlabel("Predicted Probability"); ax.set_ylabel("Count")
    plt.tight_layout()
    _show_now("Score_Distribution_with_Quantiles")

def _show_feature_importance(names, importances, topn=20):
    try:
        order = np.argsort(importances)[::-1]
        order = order[:min(topn, len(order))]
        fig, ax = plt.subplots(figsize=(6.4, 6.0))
        ax.barh(range(len(order)), importances[order][::-1])
        ax.set_yticks(range(len(order)))
        ax.set_yticklabels([names[i] for i in order][::-1])
        ax.set_title(f"Top {len(order)} Feature Importances")
        ax.set_xlabel("Gain (XGBoost)")
        plt.tight_layout()
        _show_now("Feature_Importances_Top")
    except Exception as e:
        print(f"(could not display feature importances: {e})")

# >>> NEW: compact comparison plot <<<
def _plot_model_comparison(metrics: dict, title="Model Comparison: Accuracy & Precision"):

    models = list(metrics.keys())
    accs   = [metrics[m]["acc"]  for m in models]
    precs  = [metrics[m]["prec"] for m in models]

    x = np.arange(len(models))
    width = 0.35

    fig, ax = plt.subplots(figsize=(6.5, 4.2))
    b1 = ax.bar(x - width/2, accs,  width, label="Accuracy")
    b2 = ax.bar(x + width/2, precs, width, label="Precision")

    ax.set_title(title)
    ax.set_xticks(x)
    ax.set_xticklabels(models)
    ax.set_ylim(0, 1.0)
    ax.set_ylabel("Score")
    ax.legend()

    for bars in (b1, b2):
        for bar in bars:
            h = bar.get_height()
            ax.annotate(f"{h:.3f}", xy=(bar.get_x()+bar.get_width()/2, h),
                        xytext=(0, 4), textcoords="offset points", ha="center", va="bottom", fontsize=9)

    plt.tight_layout()
    _show_now("Model_Comparison_Accuracy_Precision")

# =============================
# Main
# =============================
def main(
    data_dir: str = DATA_DIR,
    alert_rate: float = DEFAULT_ALERT_RATE,
    topk_export: int = DEFAULT_TOPK_EXPORT,
    p_at_k_values = DEFAULT_P_AT_K_VALUES
):
    global PLOT_MODE, PLOTS_DIR

    print(f"🖨️  Plot mode: {PLOT_MODE} | Figures dir: {PLOTS_DIR}")
    df = load_all_csvs(data_dir)
    required = set(['user','timestamp', LABEL] + BASE_FEATURES)
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
    df = df.dropna(subset=['timestamp']).sort_values('timestamp').reset_index(drop=True)

    df = add_time_flags(df)
    df = add_user_rolling(df)
    df = add_user_robust_zscores(df)
    df = add_night_ratio(df)
    df = add_interactions(df)

    EXTRA = [
        'hour','month','is_business_hours','is_late_night',
        *[f'number_of_emails_dispatched_mean_{w}d' for w in ROLL_WINDOWS],
        *[f'number_of_emails_dispatched_std_{w}d'  for w in ROLL_WINDOWS],
        *[f'total_logon_attempts_mean_{w}d' for w in ROLL_WINDOWS],
        *[f'total_logon_attempts_std_{w}d'  for w in ROLL_WINDOWS],
        *[f'number_of_files_interacted_mean_{w}d' for w in ROLL_WINDOWS],
        *[f'number_of_files_interacted_std_{w}d'  for w in ROLL_WINDOWS],
        *[f'usb_connection_incidents_mean_{w}d' for w in ROLL_WINDOWS],
        *[f'usb_connection_incidents_std_{w}d'  for w in ROLL_WINDOWS],
        *[f'email_delta_{w}d' for w in ROLL_WINDOWS],
        *[f'logon_delta_{w}d' for w in ROLL_WINDOWS],
        'user_rz_number_of_emails_dispatched','user_rz_total_logon_attempts',
        'user_rz_number_of_files_interacted','user_rz_usb_connection_incidents',
        'night_activity_ratio','after_hours_logon_ratio','files_per_logon','usb_after_hours','neuroticism_x_night'
    ]
    ALL_FEATS_NO_IF = BASE_FEATURES + EXTRA

    # Persist combined (optional artifact)
    df.to_csv(OUT_COMBINED, index=False)
    print(f"💾 Combined dataset written -> {OUT_COMBINED} (rows={len(df):,})")

    # Time-aware split
    split_idx = int(len(df) * 0.80)
    train_df = df.iloc[:split_idx].copy()
    test_df  = df.iloc[split_idx:].copy()
    print(f"⏱️ Time-aware split -> train: {len(train_df):,} | test: {len(test_df):,}")

    # Coerce/clean
    train_df = clip_and_coerce(train_df, ALL_FEATS_NO_IF + [LABEL])
    test_df  = clip_and_coerce(test_df,  ALL_FEATS_NO_IF + [LABEL])

    # X/y + groups
    X_train_raw = train_df[ALL_FEATS_NO_IF].copy()
    X_test_raw  = test_df[ALL_FEATS_NO_IF].copy()
    y_train = pd.to_numeric(train_df[LABEL], errors='coerce').fillna(0).astype(int).values
    y_test  = pd.to_numeric(test_df[LABEL], errors='coerce').fillna(0).astype(int).values
    groups_train = train_df['user'].astype(str).values

    print(f"\n🧩 Engineered features present: {len(ALL_FEATS_NO_IF)}/{len(ALL_FEATS_NO_IF)}\n")

    # Impute + scale (for IF only)
    imputer = SimpleImputer(strategy="median")
    X_train_imp = imputer.fit_transform(X_train_raw)
    X_test_imp  = imputer.transform(X_test_raw)

    scaler = StandardScaler(with_mean=True, with_std=True)
    X_train_scaled = scaler.fit_transform(X_train_imp)
    X_test_scaled  = scaler.transform(X_test_imp)

    # -------- speed knobs (only used when --fast is ON) --------
    if FAST:
        iforest_estimators = 100   # was 400
        xgb_estimators     = 200   # was 800
        n_cv_trials        = 5     # was 15
    else:
        iforest_estimators = 400
        xgb_estimators     = 800
        n_cv_trials        = 15
    # -----------------------------------------------------------

    # IsolationForest anomaly score (training unaffected; only score added)
    iforest = IsolationForest(
        n_estimators=iforest_estimators,
        contamination=IFOREST_CONTAM,
        random_state=42,
        n_jobs=-1
    )
    iforest.fit(X_train_scaled)
    train_if = iforest.decision_function(X_train_scaled)
    test_if  = iforest.decision_function(X_test_scaled)
    print(f"IsolationForest score range (test): {test_if.min():.3f} .. {test_if.max():.3f}")

    # Append IF score
    X_train = np.column_stack([X_train_imp, train_if])
    X_test  = np.column_stack([X_test_imp,  test_if])
    FEATURES_WITH_IF = ALL_FEATS_NO_IF + ['iforest_score']

    # XGBoost (conservative, precision-first)
    pos = (y_train == 1).sum()
    neg = (y_train == 0).sum()
    spw = max(1.0, neg / max(1, pos))

    base_xgb = XGBClassifier(
        objective='binary:logistic',
        tree_method='hist',
        max_depth=3,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.6,
        n_estimators=xgb_estimators,
        reg_lambda=2.0,
        reg_alpha=0.0,
        min_child_weight=10.0,
        scale_pos_weight=spw,
        random_state=42,
        n_jobs=-1,
        eval_metric='aucpr'
    )

    param_dist = {
        "max_depth": [3, 4],
        "learning_rate": [0.03, 0.05],
        "subsample": [0.8, 0.9],
        "colsample_bytree": [0.6, 0.8],
        "min_child_weight": [10.0, 15.0, 20.0],
        "reg_lambda": [2.0, 3.0, 4.0],
        "n_estimators": [xgb_estimators]  # fixed to keep training behaviour stable
    }

    # CV scorer uses EXACTLY the same alert rate as deployment threshold
    def p_at_rate_scorer(est, X, y):
        proba = est.predict_proba(X)[:, 1]
        prec, _k = precision_at_rate(y, proba, rate=alert_rate)  # KEEP IN SYNC
        return prec

    gkf = GroupKFold(n_splits=3)

    search = RandomizedSearchCV(
        estimator=base_xgb,
        param_distributions=param_dist,
        n_iter=n_cv_trials,
        scoring=p_at_rate_scorer,
        cv=gkf.split(X_train, y_train, groups_train),
        random_state=42,
        refit=True,
        verbose=1,
        n_jobs=-1
    )

    # Optional downsample of training rows for fast demo
    if FAST:
        max_rows = 80_000
        if len(X_train) > max_rows:
            X_train = X_train[:max_rows]
            y_train = y_train[:max_rows]
            groups_train = groups_train[:max_rows]
            print(f"⚡ FAST mode: training downsampled to {len(X_train)} rows")

    search.fit(X_train, y_train)
    best_xgb = search.best_estimator_

    # === Evaluate XGBoost on TEST with alert-budget threshold ===
    p_test = np.clip(best_xgb.predict_proba(X_test)[:, 1], 1e-9, 1-1e-9)
    print_quantiles(p_test, "test")

    n_test = len(p_test)
    k_budget = max(1, int(np.ceil(n_test * alert_rate)))
    thr = float(np.partition(p_test, -k_budget)[-k_budget]) if k_budget < n_test else 1.0

    y_hat = (p_test >= thr).astype(int)
    acc_xgb = accuracy_score(y_test, y_hat)
    prec_xgb = ( ( (y_test==1) & (y_hat==1) ).sum() ) / max(1, (y_hat==1).sum())

    # ---- ONLY PRINT Accuracy and Precision (XGBoost) ----
    print(f"[XGBoost] Accuracy: {acc_xgb:.4f} | Precision: {prec_xgb:.4f}")

    # === RandomForest baseline (no tuning), same features and thresholding ===
    rf_trees = 120 if FAST else 300
    rf = RandomForestClassifier(
        n_estimators=rf_trees,
        max_depth=None,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=42
    )
    rf.fit(X_train, y_train)
    p_test_rf = rf.predict_proba(X_test)[:, 1]
    # threshold at the SAME alert budget
    thr_rf = float(np.partition(p_test_rf, -k_budget)[-k_budget]) if k_budget < n_test else 1.0
    y_hat_rf = (p_test_rf >= thr_rf).astype(int)
    acc_rf = accuracy_score(y_test, y_hat_rf)
    prec_rf = ( ( (y_test==1) & (y_hat_rf==1) ).sum() ) / max(1, (y_hat_rf==1).sum())

    # ---- ONLY PRINT Accuracy and Precision (RandomForest) ----
    print(f"[RandomForest] Accuracy: {acc_rf:.4f} | Precision: {prec_rf:.4f}")

    # >>> NEW: model comparison plot <<<
    if not NO_PLOTS:
        _plot_model_comparison(
            {
                "XGBoost":     {"acc": float(acc_xgb), "prec": float(prec_xgb)},
                "RandomForest":{"acc": float(acc_rf),  "prec": float(prec_rf)}
            },
            title=f"Accuracy & Precision @ alert_rate={alert_rate:.3%}"
        )

    # ----- Optional visuals (kept; do not print extra metrics) -----
    if not NO_PLOTS:
        from sklearn.metrics import confusion_matrix
        _show_confusion_heatmap(confusion_matrix(y_test, y_hat), title="Confusion Matrix (XGB)")
        _show_roc_pr(y_test, p_test, title_prefix="XGB_Test")
        _show_score_hist(p_test, title="Score Distribution (XGB)")
        _show_score_quantiles(p_test)

    # Export artifacts (unchanged, still based on XGBoost ranking)
    order = np.argsort(p_test)[::-1]
    topK = min(DEFAULT_TOPK_EXPORT, len(test_df))
    head_idx = order[:topK]
    top_out = test_df.iloc[head_idx].copy()
    top_out['model_score'] = p_test[order][:topK]
    top_out.to_csv(OUT_TOPK, index=False)
    print(f"\n🔎 Exported top {topK} scored test rows -> {OUT_TOPK}")

    test_preds = test_df.copy()
    test_preds['y_true'] = y_test
    test_preds['score'] = p_test
    test_preds['y_hat@thr'] = y_hat
    test_preds.to_csv(OUT_TEST_PREDS, index=False)
    print(f"🧪 Wrote test predictions -> {OUT_TEST_PREDS}")

    try:
        importances = best_xgb.feature_importances_
        fi = pd.DataFrame({"feature": FEATURES_WITH_IF, "importance": importances}).sort_values("importance", ascending=False)
        fi.to_csv(OUT_FEATURE_IMPORTANCE, index=False)
        if not NO_PLOTS:
            _show_feature_importance(np.array(FEATURES_WITH_IF), np.array(importances), topn=20)
        print(f"📄 Full importances saved -> {OUT_FEATURE_IMPORTANCE}")
    except Exception as e:
        print(f"(could not export/plot feature importances: {e})")

    # Save bundle (XGBoost only; unchanged)
    bundle = {
        'imputer': imputer,
        'scaling_module': scaler,
        'iforest_module': iforest,
        'model': best_xgb,
        'calibrator': None,
        'training_input_features': FEATURES_WITH_IF,
        'decision_threshold': float(thr),
        'trained_at': datetime.utcnow().isoformat() + "Z",
        'notes': {
            'objective': 'precision-first (ranking)',
            'group_cv': 'GroupKFold(user)',
            'alert_rate_cv_and_eval': alert_rate,
            'iforest_contamination': IFOREST_CONTAM,
            'roll_windows': ROLL_WINDOWS,
            'scale_pos_weight': float(neg / max(1, pos)) if pos else 1.0,
            'p_at_k_values': p_at_k_values
        }
    }
    joblib.dump(bundle, OUT_PKL)
    print(f"\n✅ Model bundle saved -> {OUT_PKL}")
    print(f"Features used ({len(FEATURES_WITH_IF)}): {FEATURES_WITH_IF}")

    # Keep windows open only if explicitly showing
    if not NO_PLOTS and PLOT_MODE in ("show", "auto") and matplotlib.get_backend().lower() not in ("agg","pdf","svg","ps","cairo"):
        try:
            print("\n(Press Ctrl+C to close figure windows.)")
            plt.ioff()
            plt.show()
        except Exception:
            pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Precision-first insider threat model (XGBoost).")
    parser.add_argument("--alert_rate", type=float, default=DEFAULT_ALERT_RATE,
                        help="Alert budget as fraction of evaluated set (e.g., 0.001 == 0.1%). Used in BOTH CV scorer and final threshold.")
    parser.add_argument("--topk_export", type=int, default=DEFAULT_TOPK_EXPORT,
                        help="How many test rows to export in the ranked list.")
    parser.add_argument("--p_at_k_values", type=str, default=json.dumps(DEFAULT_P_AT_K_VALUES),
                        help='JSON list of K values for P@K display, e.g. "[5,10,25,50,100]".')
    parser.add_argument("--data_dir", type=str, default=DATA_DIR, help="Path to the datasets folder with CSVs.")
    parser.add_argument("--no_plots", action="store_true", help="Disable all plots completely.")
    parser.add_argument("--fast", action="store_true", help="Faster run: fewer trees, fewer CV trials, smaller IF.")
    parser.add_argument("--plot_mode", choices=["show","save","none","auto"], default=PLOT_MODE,
                        help="How to handle plots: show windows, save PNGs, disable, or auto-detect.")
    parser.add_argument("--plots_dir", type=str, default=PLOTS_DIR,
                        help="Directory where PNGs are saved when using save/auto modes.")
    args = parser.parse_args()

    # Apply CLI flags
    NO_PLOTS = bool(args.no_plots)
    FAST = bool(args.fast)
    PLOT_MODE = args.plot_mode if not NO_PLOTS else "none"
    PLOTS_DIR = args.plots_dir

    p_at_k_vals = json.loads(args.p_at_k_values)
    main(
        data_dir=args.data_dir,
        alert_rate=args.alert_rate,
        topk_export=args.topk_export,
        p_at_k_values=p_at_k_vals
    )








#
#
# import os, glob, joblib, numpy as np, pandas as pd, argparse, json
# from datetime import datetime
# from typing import Tuple
#
# from sklearn.impute import SimpleImputer
# from sklearn.preprocessing import StandardScaler
# from sklearn.ensemble import IsolationForest
# from sklearn.model_selection import GroupKFold, RandomizedSearchCV
# from sklearn.metrics import (
#     classification_report, confusion_matrix, roc_auc_score, average_precision_score
# )
#
# from xgboost import XGBClassifier
#
# # =============================
# # Defaults / Config
# # =============================
# HERE = os.path.abspath(os.path.dirname(__file__))
# DATA_DIR = os.path.join(HERE, "datasets")
# OUT_PKL = os.path.join(HERE, "final_hybrid_threat_model_daily.pkl")
# OUT_COMBINED = os.path.join(HERE, "final_combined_dataset.csv")
# OUT_TOPK = os.path.join(HERE, "top_scored_test_samples.csv")
# OUT_TEST_PREDS = os.path.join(HERE, "test_predictions_with_scores.csv")
# OUT_FEATURE_IMPORTANCE = os.path.join(HERE, "feature_importances.csv")
#
# LABEL = "predicted_threat_label"
#
# BASE_FEATURES = [
#     'number_of_emails_dispatched', 'number_of_files_interacted', 'total_logon_attempts',
#     'usb_connection_incidents', 'nighttime_email_events', 'number_of_night_logons',
#     'trait_openness_score', 'trait_conscientiousness_score', 'trait_extraversion_score',
#     'trait_agreeableness_score', 'trait_neuroticism_score',
#     'weekday_index', 'is_weekend_day',
#     'email_volume_change_1d', 'logon_variation_1d', 'logon_rolling_average_7d',
#     'logon_to_email_event_ratio', 'usb_to_logon_ratio', 'file_to_email_ratio',
#     'email_volume_volatility_3d', 'logon_volatility_3d'
# ]
#
# ROLL_WINDOWS = [7, 14, 30]
# IFOREST_CONTAM = 0.03
#
# # Precision-first selection targets (evaluation view)
# DEFAULT_P_AT_K_VALUES = [5, 10, 25, 50, 100, 200]
# DEFAULT_ALERT_RATE = 0.001     # 0.1% of test as alert budget threshold
# DEFAULT_TOPK_EXPORT = 200      # rows to export for manual review
#
# # =============================
# # Helpers
# # =============================
# def load_all_csvs(data_dir: str) -> pd.DataFrame:
#     print(f"📂 Reading CSVs from: {data_dir}")
#     paths = sorted(glob.glob(os.path.join(data_dir, "*.csv")))
#     if not paths:
#         raise FileNotFoundError(f"No CSV files found in {data_dir}")
#     frames = []
#     for p in paths:
#         df = pd.read_csv(p)
#         df.columns = [c.strip() for c in df.columns]
#         frames.append(df)
#         print(f"Loaded {os.path.basename(p)} with {len(df):,} rows")
#     big = pd.concat(frames, ignore_index=True)
#     print(f"\n✅ Combined rows: {len(big):,} from {len(frames)} files\n")
#     return big
#
# def clip_and_coerce(df: pd.DataFrame, cols) -> pd.DataFrame:
#     for c in cols:
#         df[c] = pd.to_numeric(df[c], errors='coerce').astype('float64')
#         df[c] = df[c].replace([np.inf, -np.inf], np.nan)
#     for c in ['logon_to_email_event_ratio', 'usb_to_logon_ratio', 'file_to_email_ratio']:
#         if c in df.columns:
#             df[c] = df[c].clip(0, 50)
#     return df
#
# def add_time_flags(df: pd.DataFrame) -> pd.DataFrame:
#     dt = pd.to_datetime(df['timestamp'], errors='coerce')
#     df['hour'] = dt.dt.hour
#     df['month'] = dt.dt.month
#     df['is_business_hours'] = ((df['hour'] >= 8) & (df['hour'] <= 18)).astype(int)
#     df['is_late_night'] = ((df['hour'] <= 5) | (df['hour'] >= 23)).astype(int)
#     return df
#
# def add_user_rolling(df: pd.DataFrame) -> pd.DataFrame:
#     df = df.sort_values(['user', 'timestamp'])
#     bases = ['number_of_emails_dispatched','total_logon_attempts',
#              'number_of_files_interacted','usb_connection_incidents']
#     for w in ROLL_WINDOWS:
#         for col in bases:
#             df[f'{col}_mean_{w}d'] = df.groupby('user')[col].transform(lambda x: x.rolling(w, min_periods=1).mean())
#             df[f'{col}_std_{w}d']  = df.groupby('user')[col].transform(lambda x: x.rolling(w, min_periods=1).std()).fillna(0.0)
#         df[f'email_delta_{w}d'] = df['number_of_emails_dispatched'] - df[f'number_of_emails_dispatched_mean_{w}d']
#         df[f'logon_delta_{w}d'] = df['total_logon_attempts'] - df[f'total_logon_attempts_mean_{w}d']
#     return df
#
# def _mad(x: pd.Series) -> float:
#     med = np.median(x)
#     return np.median(np.abs(x - med))
#
# def add_user_robust_zscores(df: pd.DataFrame) -> pd.DataFrame:
#     bases = ['number_of_emails_dispatched','total_logon_attempts',
#              'number_of_files_interacted','usb_connection_incidents']
#     eps = 1e-6
#     for col in bases:
#         med = df.groupby('user')[col].transform('median')
#         mad = df.groupby('user')[col].transform(_mad).fillna(0.0)
#         denom = 1.4826 * mad + eps
#         df[f'user_rz_{col}'] = (df[col] - med) / denom
#     return df
#
# def add_night_ratio(df: pd.DataFrame) -> pd.DataFrame:
#     total = df['number_of_emails_dispatched'] + df['total_logon_attempts']
#     df['night_activity_ratio'] = (df['nighttime_email_events'] + df['number_of_night_logons']) / (total + 1.0)
#     return df
#
# def add_interactions(df: pd.DataFrame) -> pd.DataFrame:
#     df['after_hours_logon_ratio'] = (df['number_of_night_logons'] / (df['total_logon_attempts'] + 1.0)).clip(0, 1)
#     df['files_per_logon'] = (df['number_of_files_interacted'] / (df['total_logon_attempts'] + 1.0)).clip(0, 100)
#     df['usb_after_hours'] = (df['usb_connection_incidents'] * df['is_late_night']).astype(float)
#     df['neuroticism_x_night'] = df['trait_neuroticism_score'] * df['night_activity_ratio']
#     return df
#
# def precision_at_k(y_true: np.ndarray, scores: np.ndarray, k: int) -> float:
#     if k <= 0:
#         return 0.0
#     k = min(k, len(scores))
#     idx = np.argpartition(scores, -k)[-k:]
#     top_sorted = idx[np.argsort(scores[idx])[::-1]]
#     sel = y_true[top_sorted].astype(int)
#     return float(sel.sum()) / float(k)
#
# def precision_at_rate(y_true: np.ndarray, scores: np.ndarray, rate: float) -> Tuple[float, int]:
#     n = len(scores)
#     k = max(1, int(np.ceil(n * rate)))
#     return precision_at_k(y_true, scores, k), k
#
# def print_quantiles(scores: np.ndarray, label: str):
#     qs = np.quantile(scores, [0.50, 0.90, 0.95, 0.99, 0.995, 0.999])
#     print(f"\nScore quantiles ({label}): 50% {qs[0]:.4f} | 90% {qs[1]:.4f} | 95% {qs[2]:.4f} | "
#           f"99% {qs[3]:.4f} | 99.5% {qs[4]:.4f} | 99.9% {qs[5]:.4f}")
#
# # =============================
# # Main
# # =============================
# def main(
#     data_dir: str = DATA_DIR,
#     alert_rate: float = DEFAULT_ALERT_RATE,
#     topk_export: int = DEFAULT_TOPK_EXPORT,
#     p_at_k_values = DEFAULT_P_AT_K_VALUES
# ):
#     # Load & check
#     df = load_all_csvs(data_dir)
#     required = set(['user','timestamp', LABEL] + BASE_FEATURES)
#     missing = required - set(df.columns)
#     if missing:
#         raise ValueError(f"Missing required columns: {missing}")
#
#     df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
#     df = df.dropna(subset=['timestamp']).sort_values('timestamp').reset_index(drop=True)
#
#     # Feature engineering
#     df = add_time_flags(df)
#     df = add_user_rolling(df)
#     df = add_user_robust_zscores(df)
#     df = add_night_ratio(df)
#     df = add_interactions(df)
#
#     EXTRA = [
#         'hour','month','is_business_hours','is_late_night',
#         *[f'number_of_emails_dispatched_mean_{w}d' for w in ROLL_WINDOWS],
#         *[f'number_of_emails_dispatched_std_{w}d'  for w in ROLL_WINDOWS],
#         *[f'total_logon_attempts_mean_{w}d' for w in ROLL_WINDOWS],
#         *[f'total_logon_attempts_std_{w}d'  for w in ROLL_WINDOWS],
#         *[f'number_of_files_interacted_mean_{w}d' for w in ROLL_WINDOWS],
#         *[f'number_of_files_interacted_std_{w}d'  for w in ROLL_WINDOWS],
#         *[f'usb_connection_incidents_mean_{w}d' for w in ROLL_WINDOWS],
#         *[f'usb_connection_incidents_std_{w}d'  for w in ROLL_WINDOWS],
#         *[f'email_delta_{w}d' for w in ROLL_WINDOWS],
#         *[f'logon_delta_{w}d' for w in ROLL_WINDOWS],
#         'user_rz_number_of_emails_dispatched','user_rz_total_logon_attempts',
#         'user_rz_number_of_files_interacted','user_rz_usb_connection_incidents',
#         'night_activity_ratio','after_hours_logon_ratio','files_per_logon','usb_after_hours','neuroticism_x_night'
#     ]
#     ALL_FEATS_NO_IF = BASE_FEATURES + EXTRA
#
#     # Persist combined
#     df.to_csv(OUT_COMBINED, index=False)
#     print(f"💾 Combined dataset written -> {OUT_COMBINED} (rows={len(df):,})")
#
#     # Time-aware split
#     split_idx = int(len(df) * 0.80)
#     train_df = df.iloc[:split_idx].copy()
#     test_df  = df.iloc[split_idx:].copy()
#     print(f"⏱️ Time-aware split -> train: {len(train_df):,} | test: {len(test_df):,}")
#
#     # Coerce/clean
#     train_df = clip_and_coerce(train_df, ALL_FEATS_NO_IF + [LABEL])
#     test_df  = clip_and_coerce(test_df,  ALL_FEATS_NO_IF + [LABEL])
#
#     # X/y + groups
#     X_train_raw = train_df[ALL_FEATS_NO_IF].copy()
#     X_test_raw  = test_df[ALL_FEATS_NO_IF].copy()
#     y_train = pd.to_numeric(train_df[LABEL], errors='coerce').fillna(0).astype(int).values
#     y_test  = pd.to_numeric(test_df[LABEL], errors='coerce').fillna(0).astype(int).values
#     groups_train = train_df['user'].astype(str).values
#
#     print(f"\n🧩 Engineered features present: {len(ALL_FEATS_NO_IF)}/{len(ALL_FEATS_NO_IF)}\n")
#
#     # Impute + scale (for IF only)
#     imputer = SimpleImputer(strategy="median")
#     X_train_imp = imputer.fit_transform(X_train_raw)
#     X_test_imp  = imputer.transform(X_test_raw)
#
#     scaler = StandardScaler(with_mean=True, with_std=True)
#     X_train_scaled = scaler.fit_transform(X_train_imp)
#     X_test_scaled  = scaler.transform(X_test_imp)
#
#     # IsolationForest anomaly score
#     iforest = IsolationForest(
#         n_estimators=400, contamination=IFOREST_CONTAM, random_state=42, n_jobs=-1
#     )
#     iforest.fit(X_train_scaled)
#     train_if = iforest.decision_function(X_train_scaled)
#     test_if  = iforest.decision_function(X_test_scaled)
#     print(f"IsolationForest score range (test): {test_if.min():.3f} .. {test_if.max():.3f}")
#
#     # Append IF score
#     X_train = np.column_stack([X_train_imp, train_if])
#     X_test  = np.column_stack([X_test_imp,  test_if])
#     FEATURES_WITH_IF = ALL_FEATS_NO_IF + ['iforest_score']
#
#     # XGBoost (conservative, precision-first)
#     pos = (y_train == 1).sum()
#     neg = (y_train == 0).sum()
#     spw = max(1.0, neg / max(1, pos))
#
#     base_xgb = XGBClassifier(
#         objective='binary:logistic',
#         tree_method='hist',
#         max_depth=3,              # conservative
#         learning_rate=0.05,
#         subsample=0.85,
#         colsample_bytree=0.6,
#         n_estimators=800,
#         reg_lambda=2.0,
#         reg_alpha=0.0,
#         min_child_weight=10.0,
#         scale_pos_weight=spw,
#         random_state=42,
#         n_jobs=-1,
#         eval_metric='aucpr'
#     )
#
#     param_dist = {
#         "max_depth": [3, 4],
#         "learning_rate": [0.03, 0.05],
#         "subsample": [0.8, 0.9],
#         "colsample_bytree": [0.6, 0.8],
#         "min_child_weight": [10.0, 15.0, 20.0],
#         "reg_lambda": [2.0, 3.0, 4.0],
#         "n_estimators": [800, 1000, 1200]
#     }
#
#     # CV scorer uses EXACTLY the same alert rate as deployment threshold
#     def p_at_rate_scorer(est, X, y):
#         proba = est.predict_proba(X)[:, 1]
#         prec, _k = precision_at_rate(y, proba, rate=alert_rate)  # KEEP IN SYNC
#         return prec
#
#     gkf = GroupKFold(n_splits=3)
#     search = RandomizedSearchCV(
#         estimator=base_xgb,
#         param_distributions=param_dist,
#         n_iter=15,
#         scoring=p_at_rate_scorer,
#         cv=gkf.split(X_train, y_train, groups_train),
#         random_state=42,
#         refit=True,
#         verbose=1,
#         n_jobs=-1
#     )
#     search.fit(X_train, y_train)
#     best_xgb = search.best_estimator_
#
#     # Evaluate on TEST
#     p_test = np.clip(best_xgb.predict_proba(X_test)[:, 1], 1e-9, 1-1e-9)
#     print_quantiles(p_test, "test")
#
#     # Alert budget threshold at the SAME rate used in CV
#     n_test = len(p_test)
#     k_budget = max(1, int(np.ceil(n_test * alert_rate)))
#     thr = float(np.partition(p_test, -k_budget)[-k_budget]) if k_budget < n_test else 1.0
#
#     raw_k = (p_test >= thr).sum()
#     print(f"\nCandidates: raw>thr={raw_k}")
#
#     # Report
#     y_hat = (p_test >= thr).astype(int)
#     print("\n📟 Report at chosen threshold:\n")
#     print(classification_report(y_test, y_hat, digits=4, zero_division=0))
#     cm = confusion_matrix(y_test, y_hat)
#     print("Confusion Matrix:\n", cm)
#     try:
#         print(f"ROC-AUC: {roc_auc_score(y_test, p_test):.4f}  |  PR-AUC: {average_precision_score(y_test, p_test):.4f}")
#     except Exception:
#         pass
#     tp = int(((y_test == 1) & (y_hat == 1)).sum())
#     fp = int(((y_test == 0) & (y_hat == 1)).sum())
#     fn = int(((y_test == 1) & (y_hat == 0)).sum())
#     tn = int(((y_test == 0) & (y_hat == 0)).sum())
#     P = tp / (tp + fp) if (tp + fp) > 0 else 0.0
#     R = tp / (tp + fn) if (tp + fn) > 0 else 0.0
#     print(f"Chosen threshold (p>=): {thr:.4f}  [alert_budget(rate={alert_rate*100:.3f}%)]")
#     print(f"Achieved Precision: {P:.4f} | Recall: {R:.4f} | TP={tp} FP={fp} FN={fn} TN={tn}")
#
#     # Precision@K table
#     print("\nPrecision@K (selection score ranking):")
#     order = np.argsort(p_test)[::-1]
#     for K in p_at_k_values:
#         k = min(K, len(order))
#         prec_k = precision_at_k(y_test[order], p_test[order], k)
#         print(f"P@{K:<4}= {prec_k:.3f}")
#
#     # Export top-scored rows
#     topK = min(topk_export, len(test_df))
#     head_idx = order[:topK]
#     top_out = test_df.iloc[head_idx].copy()
#     top_out['model_score'] = p_test[order][:topK]
#     top_out.to_csv(OUT_TOPK, index=False)
#     print(f"\n🔎 Exported top {topK} scored test rows -> {OUT_TOPK}")
#
#     # Export ALL test predictions for error analysis
#     test_preds = test_df.copy()
#     test_preds['y_true'] = y_test
#     test_preds['score'] = p_test
#     test_preds['y_hat@thr'] = y_hat
#     test_preds.to_csv(OUT_TEST_PREDS, index=False)
#     print(f"🧪 Wrote test predictions -> {OUT_TEST_PREDS}")
#
#     # Feature importances (gain) dump
#     try:
#         importances = best_xgb.feature_importances_
#         fi = pd.DataFrame({
#             "feature": FEATURES_WITH_IF,
#             "importance": importances
#         }).sort_values("importance", ascending=False)
#         fi.to_csv(OUT_FEATURE_IMPORTANCE, index=False)
#         top10 = fi.head(10).to_dict("records")
#         print("🏷️ Top feature importances (gain):")
#         for r in top10:
#             print(f"  {r['feature']:<35} {r['importance']:.6f}")
#         print(f"📄 Full importances saved -> {OUT_FEATURE_IMPORTANCE}")
#     except Exception as e:
#         print(f"(could not export feature importances: {e})")
#
#     # Save bundle
#     bundle = {
#         'imputer': imputer,
#         'scaling_module': scaler,
#         'iforest_module': iforest,
#         'model': best_xgb,
#         'calibrator': None,  # no calibration
#         'training_input_features': FEATURES_WITH_IF,
#         'decision_threshold': float(thr),
#         'trained_at': datetime.utcnow().isoformat() + "Z",
#         'notes': {
#             'objective': 'precision-first (ranking)',
#             'group_cv': 'GroupKFold(user)',
#             'alert_rate_cv_and_eval': alert_rate,
#             'iforest_contamination': IFOREST_CONTAM,
#             'roll_windows': ROLL_WINDOWS,
#             'scale_pos_weight': spw,
#             'p_at_k_values': p_at_k_values
#         }
#     }
#     joblib.dump(bundle, OUT_PKL)
#     print(f"\n✅ Model bundle saved -> {OUT_PKL}")
#     print(f"Features used ({len(FEATURES_WITH_IF)}): {FEATURES_WITH_IF}")
#
# if __name__ == "__main__":
#     parser = argparse.ArgumentParser(description="Precision-first insider threat model (XGBoost).")
#     parser.add_argument("--alert_rate", type=float, default=DEFAULT_ALERT_RATE,
#                         help="Alert budget as fraction of evaluated set (e.g., 0.001 == 0.1%). Used in BOTH CV scorer and final threshold.")
#     parser.add_argument("--topk_export", type=int, default=DEFAULT_TOPK_EXPORT,
#                         help="How many test rows to export in the ranked list.")
#     parser.add_argument("--p_at_k_values", type=str, default=json.dumps(DEFAULT_P_AT_K_VALUES),
#                         help="JSON list of K values for P@K display, e.g. \"[5,10,25,50,100]\".")
#     parser.add_argument("--data_dir", type=str, default=DATA_DIR, help="Path to the datasets folder with CSVs.")
#     args = parser.parse_args()
#     p_at_k_vals = json.loads(args.p_at_k_values)
#     main(
#         data_dir=args.data_dir,
#         alert_rate=args.alert_rate,
#         topk_export=args.topk_export,
#         p_at_k_values=p_at_k_vals
#     )

# hybrid_threat_pipeline.py
import os
import glob
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from collections import Counter

from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    classification_report, confusion_matrix, roc_auc_score,
    precision_recall_curve, f1_score
)
from sklearn.isotonic import IsotonicRegression
from imblearn.over_sampling import SMOTE

# =============================
# Config
# =============================
HERE = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(HERE, "datasets")
OUT_PKL = os.path.join(HERE, "final_hybrid_threat_model_daily.pkl")
OUT_COMBINED = os.path.join(HERE, "final_combined_dataset.csv")

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
LABEL = "predicted_threat_label"

# Model/threshold settings
IFOREST_CONTAM = 0.03
RF_PARAMS = dict(
    n_estimators=400, max_depth=None, min_samples_leaf=2,
    class_weight="balanced", n_jobs=-1, random_state=42,
)
USE_SMOTE = True
SMOTE_STRATEGY = 0.10
SMOTE_K_NEIGHBORS = 5

PRECISION_TARGET = 0.30
MIN_RECALL = 0.05
MIN_POS_ALERTS = 20
F1_SWEEP_RANGE = (0.02, 0.60, 117)

# =============================
# Helpers
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
    print(f"\n✅ Combined rows: {len(big):,} from {len(frames)} files")
    return big

def add_user_zscores(df: pd.DataFrame) -> pd.DataFrame:
    cols = [
        'number_of_emails_dispatched', 'total_logon_attempts',
        'number_of_files_interacted', 'usb_connection_incidents'
    ]
    for col in cols:
        mu = df.groupby('user')[col].transform('mean')
        sd = df.groupby('user')[col].transform('std')
        sd = sd.replace(0, 1).fillna(1)
        df[f'user_z_{col}'] = (df[col] - mu) / sd
    return df

def add_night_ratio(df: pd.DataFrame) -> pd.DataFrame:
    total = df['number_of_emails_dispatched'] + df['total_logon_attempts']
    df['night_activity_ratio'] = (df['nighttime_email_events'] + df['number_of_night_logons']) / (total + 1.0)
    return df

def clip_ratios(df: pd.DataFrame) -> pd.DataFrame:
    for c in ['logon_to_email_event_ratio', 'usb_to_logon_ratio', 'file_to_email_ratio']:
        if c in df.columns:
            df[c] = df[c].clip(lower=0, upper=20)
    return df

def coerce_numeric(df: pd.DataFrame, cols) -> pd.DataFrame:
    # Vectorized, warning-free conversion that allows NaNs
    df = df.copy()
    for c in cols:
        s = pd.to_numeric(df[c], errors='coerce')
        s = s.replace([np.inf, -np.inf], np.nan)
        df[c] = s.astype('float64')
    return df


def choose_threshold_by_precision(y_true, p, precision_target=0.30, min_recall=0.05, min_pos=20):
    prec, rec, thr = precision_recall_curve(y_true, p)
    thr = np.r_[thr, 1.0]
    for i in range(len(thr)):
        t = float(thr[i])
        y_hat = (p >= t).astype(int)
        tp = int(np.sum((y_true == 1) & (y_hat == 1)))
        fp = int(np.sum((y_true == 0) & (y_hat == 1)))
        fn = int(np.sum((y_true == 1) & (y_hat == 0)))
        pos = tp + fp
        prec_i = tp / pos if pos > 0 else 0.0
        rec_i = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        if prec_i >= precision_target and rec_i >= min_recall and pos >= min_pos:
            return t, prec_i, rec_i, tp, fp, fn
    return None, None, None, None, None, None

def fallback_threshold_by_f1(y_true, p, sweep=(0.02, 0.60, 117)):
    best_f1, best_thr, best_tuple = 0.0, 0.5, (0.0, 0.0, 0, 0, 0)
    for t in np.linspace(*sweep):
        y_hat = (p >= t).astype(int)
        tp = int(np.sum((y_true == 1) & (y_hat == 1)))
        fp = int(np.sum((y_true == 0) & (y_hat == 1)))
        fn = int(np.sum((y_true == 1) & (y_hat == 0)))
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = f1_score(y_true, y_hat, zero_division=0)
        if f1 > best_f1:
            best_f1, best_thr = f1, float(t)
            best_tuple = (prec, rec, tp, fp, fn)
    return best_thr, best_f1, best_tuple

# =============================
# Main
# =============================
if __name__ == "__main__":
    # 1) Load, check, sort
    df = load_all_csvs(DATA_DIR)
    required = set(['user', 'timestamp', LABEL] + BASE_FEATURES)
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns in combined data: {missing}")
    df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
    df = df.dropna(subset=['timestamp']).sort_values('timestamp').reset_index(drop=True)

    # 2) Extra engineered features
    df = clip_ratios(df)
    df = add_user_zscores(df)
    df = add_night_ratio(df)
    EXTRA_FEATURES = [
        'user_z_number_of_emails_dispatched',
        'user_z_total_logon_attempts',
        'user_z_number_of_files_interacted',
        'user_z_usb_connection_incidents',
        'night_activity_ratio',
    ]
    ALL_FEATS_NO_IF = BASE_FEATURES + EXTRA_FEATURES

    # Save combined for reference
    df.to_csv(OUT_COMBINED, index=False)
    print(f"\n💾 Combined dataset written -> {OUT_COMBINED} (rows={len(df):,})")

    # 3) Time‑aware split
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx].copy()
    test_df  = df.iloc[split_idx:].copy()
    print(f"⏱️ Time-aware split -> train: {len(train_df):,} | test: {len(test_df):,}")

    # 4) Coerce numeric ONLY for features (avoid label NaN->int issues)
    train_df = coerce_numeric(train_df, ALL_FEATS_NO_IF)
    test_df  = coerce_numeric(test_df,  ALL_FEATS_NO_IF)

    # 5) Build X/y (handle label separately and safely)
    X_train_raw = train_df[ALL_FEATS_NO_IF].copy()
    X_test_raw  = test_df[ALL_FEATS_NO_IF].copy()
    y_train = pd.to_numeric(train_df[LABEL], errors='coerce').fillna(0).astype(int).values
    y_test  = pd.to_numeric(test_df[LABEL],  errors='coerce').fillna(0).astype(int).values

    # 6) Impute -> Scale
    imputer = SimpleImputer(strategy="median")
    X_train_imp = imputer.fit_transform(X_train_raw)
    X_test_imp  = imputer.transform(X_test_raw)

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train_imp)
    X_test_scaled  = scaler.transform(X_test_imp)

    # 7) IsolationForest anomaly score (fitted on scaled)
    iforest = IsolationForest(
        n_estimators=400, contamination=IFOREST_CONTAM, random_state=42, n_jobs=-1
    )
    iforest.fit(X_train_scaled)
    train_if = iforest.decision_function(X_train_scaled)   # higher = more normal
    test_if  = iforest.decision_function(X_test_scaled)
    print(f"IsolationForest score range (test): {test_if.min():.3f} .. {test_if.max():.3f}")

    # Append IF score (on imputed features)
    X_train_aug = np.column_stack([X_train_imp, train_if])
    X_test_aug  = np.column_stack([X_test_imp,  test_if])
    FEATURES_WITH_IF = ALL_FEATS_NO_IF + ['iforest_score']

    # 8) Keep a calibration slice (last 10% of train)
    cut = int(len(X_train_aug) * 0.9)
    X_core, y_core = X_train_aug[:cut], y_train[:cut]
    X_calib, y_calib = X_train_aug[cut:], y_train[cut:]

    # 9) Balance with SMOTE on the core slice (no NaNs here)
    # 9) Balance with SMOTE on the core slice (no NaNs here)
    if USE_SMOTE:
        print(f"Class balance (core train) before SMOTE: {Counter(y_core)}")
        maj = int((y_core == 0).sum())
        mino = int((y_core == 1).sum())
        current_ratio = mino / max(maj, 1)

        # If the current minority ratio is already >= requested, either skip or bump it slightly
        if current_ratio >= SMOTE_STRATEGY:
            print(f"⚠️  Current minority/majority ratio ({current_ratio:.3f}) "
                  f"is >= target ({SMOTE_STRATEGY:.3f}). Skipping SMOTE.")
            X_core_bal, y_core_bal = X_core, y_core
        else:
            # Optionally, you could auto-bump to a safer target (e.g., +5% above current)
            target_ratio = max(SMOTE_STRATEGY, current_ratio + 0.05)
            print(f"Using SMOTE with sampling_strategy={target_ratio:.3f} "
                  f"(from current {current_ratio:.3f})")
            sm = SMOTE(
                random_state=42,
                k_neighbors=min(SMOTE_K_NEIGHBORS, max(mino - 1, 1)),  # safe k
                sampling_strategy=target_ratio
            )
            X_core_bal, y_core_bal = sm.fit_resample(X_core, y_core)
            print(f"Class balance (core train) after  SMOTE: {Counter(y_core_bal)}")
    else:
        X_core_bal, y_core_bal = X_core, y_core
        print(f"Class balance (core train): {Counter(y_core_bal)} (SMOTE disabled)")

    # 10) Train RF
    rf = RandomForestClassifier(**RF_PARAMS)
    rf.fit(X_core_bal, y_core_bal)

    # 11) Probability calibration (isotonic) on calibration slice
    eps = 1e-6
    p_cal_raw = rf.predict_proba(X_calib)[:, 1]
    p_cal_raw = np.clip(p_cal_raw, eps, 1 - eps)
    calibrator = IsotonicRegression(out_of_bounds='clip')
    calibrator.fit(p_cal_raw, y_calib)

    # 12) Evaluate on TEST with calibrated probs
    p_test_raw = rf.predict_proba(X_test_aug)[:, 1]
    p_test_raw = np.clip(p_test_raw, eps, 1 - eps)
    p_test = calibrator.transform(p_test_raw)

    thr, P, R, tp, fp, fn = choose_threshold_by_precision(
        y_test, p_test,
        precision_target=PRECISION_TARGET, min_recall=MIN_RECALL, min_pos=MIN_POS_ALERTS
    )
    chosen_mode = "max_precision"
    if thr is None:
        thr, best_f1, (P, R, tp, fp, fn) = fallback_threshold_by_f1(y_test, p_test, F1_SWEEP_RANGE)
        chosen_mode = f"f1_fallback (F1={best_f1:.4f})"

    y_hat = (p_test >= thr).astype(int)

    print("\n📟 Report at chosen threshold:\n")
    print(classification_report(y_test, y_hat, digits=4))
    print("Confusion Matrix:\n", confusion_matrix(y_test, y_hat))
    try:
        print(f"ROC-AUC: {roc_auc_score(y_test, p_test):.4f}")
    except Exception:
        pass
    print(f"Chosen threshold (p>=): {thr:.3f}  [{chosen_mode}]")

    # 13) Quick threshold sweep preview
    grid = np.linspace(0.05, 0.50, 10)
    print("\nThreshold sweep (first 10 rows):")
    print(" thr  precision   recall       f1   tp    fp    fn     tn")
    for t in grid:
        y_ = (p_test >= t).astype(int)
        tp_ = int(np.sum((y_test == 1) & (y_ == 1)))
        fp_ = int(np.sum((y_test == 0) & (y_ == 1)))
        fn_ = int(np.sum((y_test == 1) & (y_ == 0)))
        tn_ = int(np.sum((y_test == 0) & (y_ == 0)))
        prec_ = tp_ / (tp_ + fp_) if (tp_ + fp_) > 0 else 0.0
        rec_ = tp_ / (tp_ + fn_) if (tp_ + fn_) > 0 else 0.0
        f1_ = f1_score(y_test, y_, zero_division=0)
        print(f"{t:.2f}   {prec_: .6f} {rec_: .6f} {f1_: .6f} {tp_:4d} {fp_:4d} {fn_:5d} {tn_:6d}")

    # 14) Save everything (use the *fitted* imputer/scaler, not fresh ones)
    bundle = {
        'imputer': imputer,
        'scaling_module': scaler,
        'iforest_module': iforest,
        'random_forest_module': rf,
        'calibrator': calibrator,
        'training_input_features': FEATURES_WITH_IF,
        'decision_threshold': float(thr),
        'trained_at': datetime.utcnow().isoformat() + "Z",
        'notes': {
            'precision_target': PRECISION_TARGET,
            'min_recall': MIN_RECALL,
            'min_positives': MIN_POS_ALERTS,
            'smote': USE_SMOTE,
            'smote_strategy': SMOTE_STRATEGY,
            'iforest_contamination': IFOREST_CONTAM,
            'extra_features': EXTRA_FEATURES
        }
    }
    joblib.dump(bundle, OUT_PKL)
    print(f"\n✅ Model bundle saved -> {OUT_PKL}\n")
    print(f"Features used ({len(FEATURES_WITH_IF)}): {FEATURES_WITH_IF}")

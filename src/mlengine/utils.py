#
import shap
#
# def generate_shap_reason_for_threat(model, input_df, feature_names, class_index=1, top_n=3):
#     """
#     Generate SHAP-based explanation for a threat instance.
#
#     Args:
#         model: Trained classifier (e.g., RandomForestClassifier)
#         input_df: Pandas DataFrame with a single row
#         feature_names: List of features used during training
#         class_index: SHAP class index (1 for threat)
#         top_n: Top N contributing features to return
#
#     Returns:
#         str: Human-readable explanation string
#     """
#     explainer = shap.TreeExplainer(model)
#     shap_values = explainer.shap_values(input_df)
#     shap_row = shap_values[class_index][0]
#
#     contributions = sorted(
#         zip(feature_names, shap_row),
#         key=lambda x: abs(x[1]),
#         reverse=True
#     )
#
#     reasons = []
#     for feature, value in contributions[:top_n]:
#         direction = "increased" if value > 0 else "decreased"
#         reasons.append(f"{feature} {direction} threat score")
#
#     return " | ".join(reasons)



def generate_shap_reason_for_threat(model, input_df, feature_names):
    import shap
    import numpy as np

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(input_df)

    # Handle binary and multiclass cases
    if isinstance(shap_values, list):
        if len(shap_values) == 1:
            shap_row = shap_values[0][0]
        else:
            shap_row = shap_values[1][0]  # assume index 1 = "threat"
    else:
        shap_row = shap_values[0]

    # Ensure all values are scalar (not arrays)
    shap_row = np.array(shap_row).flatten()

    # Zip feature names with shap values
    shap_scores = list(zip(feature_names, shap_row))

    # Sort top absolute impact values
    top_features = sorted(shap_scores, key=lambda x: abs(x[1]), reverse=True)[:3]

    reason = ", ".join([f"{feature} (impact={value:.4f})" for feature, value in top_features])
    return reason

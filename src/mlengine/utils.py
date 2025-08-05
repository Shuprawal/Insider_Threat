import shap
import numpy as np
from django.http import JsonResponse

def generate_shap_reason_for_threat(model, input_df, feature_names):


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




def my_get_object_or_404(model, **kwargs):
    try:
        return model.objects.get(**kwargs)
    except model.DoesNotExist:
        raise Exception(f"{model.__name__} not found with {kwargs}")

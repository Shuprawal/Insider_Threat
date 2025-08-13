import pandas as pd
import numpy as np
import joblib

# ===============================
# Step 1: Load model
# ===============================
model_bundle = joblib.load("final_hybrid_threat_model_daily.pkl")
scaler = model_bundle['scaling_module']
iso_model = model_bundle['iforest_module']
rf_model = model_bundle['random_forest_module']
features = model_bundle['training_input_features']

# ===============================
# Step 2: Load test CSV
# ===============================

test_df = pd.read_csv("./Final_Threat_Testing_Dataset.csv")
print('new')
# test_df = pd.read_csv("final_test_logs.csv")

# ===============================
# Step 3: Prepare features
# ===============================
X = test_df[features]
X_scaled = scaler.transform(X)

# ===============================
# Step 4: Predict
# ===============================
test_df['unsupervised_anomaly_score'] = iso_model.decision_function(X_scaled)
test_df['unsupervised_threat_flag'] = (iso_model.predict(X_scaled) == -1).astype(int)
test_df['predicted_threat_label'] = rf_model.predict(X)

# (optional) Add confidence score as % probability of being threat
probas = rf_model.predict_proba(X)
test_df['confidence_score'] = np.max(probas, axis=1) * 100

# ===============================
# Step 5: Display or export
# ===============================
# print(test_df[['user', 'activity_day', 'predicted_threat_label', 'confidence_score', 'unsupervised_anomaly_score']])
# print(test_df[['user', 'timestamp', 'predicted_threat_label', 'confidence_score', 'unsupervised_anomaly_score']])
print(test_df[['user', 'timestamp', 'predicted_threat_label', 'confidence_score', 'unsupervised_anomaly_score']])



# Save results if needed
test_df.to_csv("predicted_test_results.csv", index=False)
print("\n✅ Results saved to 'predicted_test_results.csv'")

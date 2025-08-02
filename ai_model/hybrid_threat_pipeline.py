import os
import joblib
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

# ===============================
# 📂 Step 1: Load & Prepare All Data Assets
# ===============================
directory_where_raw_datasets_are_stored = "../Datasets/"
raw_email_records = pd.read_csv(os.path.join(directory_where_raw_datasets_are_stored, "email.csv"))
raw_file_usage_logs = pd.read_csv(os.path.join(directory_where_raw_datasets_are_stored, "file.csv"))
raw_logon_details = pd.read_csv(os.path.join(directory_where_raw_datasets_are_stored, "logon.csv"))
usb_connection_events = pd.read_csv(os.path.join(directory_where_raw_datasets_are_stored, "device.csv"))
personality_profile_batch_one = pd.read_csv(os.path.join(directory_where_raw_datasets_are_stored, "psychometric.csv"))
personality_profile_batch_two = pd.read_csv(os.path.join(directory_where_raw_datasets_are_stored, "psychometric 2.csv"))

# ===============================
# 🧠 Step 2: Initial Cleansing & Tagging
# ===============================
combined_user_psychological_traits = pd.concat(
    [personality_profile_batch_one, personality_profile_batch_two], ignore_index=True
)
combined_user_psychological_traits.columns = [
    'employee_full_name_tag', 'employee_user_id_tag', 'trait_openness_score',
    'trait_conscientiousness_score', 'trait_extraversion_score',
    'trait_agreeableness_score', 'trait_neuroticism_score'
]

# Normalize datetime & extract hours
for single_log_reference in [raw_email_records, raw_file_usage_logs, raw_logon_details, usb_connection_events]:
    single_log_reference['date'] = pd.to_datetime(single_log_reference['date'], errors='coerce')
    single_log_reference['activity_day'] = single_log_reference['date'].dt.date.astype(str)
    single_log_reference['activity_hour'] = single_log_reference['date'].dt.hour

# Add night-hour detection flags
raw_email_records['night_email_flag'] = raw_email_records['activity_hour'].apply(lambda h: 1 if h < 6 or h > 22 else 0)
raw_logon_details['night_logon_flag'] = raw_logon_details['activity_hour'].apply(lambda h: 1 if h < 6 or h > 22 else 0)

# ===============================
# 📊 Step 3: Aggregate Activity By Day
# ===============================
daily_email_aggregation = raw_email_records.groupby(['user', 'activity_day']).agg(
    number_of_emails_dispatched=('id', 'count'),
    nighttime_email_events=('night_email_flag', 'sum')
).reset_index()

daily_file_aggregation = raw_file_usage_logs.groupby(['user', 'activity_day']).agg(
    number_of_files_interacted=('id', 'count')
).reset_index()

daily_logon_summary = raw_logon_details.groupby(['user', 'activity_day']).agg(
    total_logon_attempts=('id', 'count'),
    number_of_night_logons=('night_logon_flag', 'sum')
).reset_index()

daily_usb_summary = usb_connection_events.groupby(['user', 'activity_day']).agg(
    usb_connection_incidents=('id', 'count')
).reset_index()

# ===============================
# 🔗 Step 4: Unify Daily Behavior + Psychology
# ===============================
merged_daily_behaviors = daily_email_aggregation \
    .merge(daily_file_aggregation, on=['user', 'activity_day'], how='outer') \
    .merge(daily_logon_summary, on=['user', 'activity_day'], how='outer') \
    .merge(daily_usb_summary, on=['user', 'activity_day'], how='outer')

merged_daily_behaviors = merged_daily_behaviors.merge(
    combined_user_psychological_traits,
    left_on='user',
    right_on='employee_user_id_tag',
    how='left'
)

merged_daily_behaviors.fillna(0, inplace=True)

# ===============================
# ⏳ Step 5: Behavioral Trends & Additional Metrics
# ===============================
merged_daily_behaviors['weekday_index'] = pd.to_datetime(merged_daily_behaviors['activity_day']).dt.dayofweek
merged_daily_behaviors['is_weekend_day'] = merged_daily_behaviors['weekday_index'].isin([5, 6]).astype(int)

merged_daily_behaviors.sort_values(['user', 'activity_day'], inplace=True)

merged_daily_behaviors['email_volume_change_1d'] = merged_daily_behaviors.groupby('user')['number_of_emails_dispatched'].diff().fillna(0)
merged_daily_behaviors['logon_variation_1d'] = merged_daily_behaviors.groupby('user')['total_logon_attempts'].diff().fillna(0)
merged_daily_behaviors['logon_rolling_average_7d'] = merged_daily_behaviors.groupby('user')['total_logon_attempts'].transform(
    lambda x: x.rolling(7, min_periods=1).mean()
)
merged_daily_behaviors['logon_to_email_event_ratio'] = merged_daily_behaviors['total_logon_attempts'] / (merged_daily_behaviors['number_of_emails_dispatched'] + 1)

# ===============================
# 🔍 Step 6: Extract Inputs for Model Training
# ===============================
relevant_model_input_features = [
    'number_of_emails_dispatched', 'number_of_files_interacted', 'total_logon_attempts', 'usb_connection_incidents',
    'nighttime_email_events', 'number_of_night_logons',
    'trait_openness_score', 'trait_conscientiousness_score', 'trait_extraversion_score',
    'trait_agreeableness_score', 'trait_neuroticism_score',
    'weekday_index', 'is_weekend_day',
    'email_volume_change_1d', 'logon_variation_1d',
    'logon_rolling_average_7d', 'logon_to_email_event_ratio'
]

unscaled_feature_matrix_for_analysis = merged_daily_behaviors[relevant_model_input_features]
data_normalizer_instance = StandardScaler()
normalized_feature_values = data_normalizer_instance.fit_transform(unscaled_feature_matrix_for_analysis)

# ===============================
# 🧪 Step 7: Isolation Forest – Unsupervised Anomaly Detection
# ===============================
# 🎯 Train the Isolation Forest (Unsupervised)
isolation_model_instance = IsolationForest(contamination=0.03, random_state=42)
isolation_model_instance.fit(normalized_feature_values)

# ✅ Now you can compute anomaly scores
merged_daily_behaviors['unsupervised_anomaly_score'] = isolation_model_instance.decision_function(normalized_feature_values)
merged_daily_behaviors['unsupervised_threat_flag'] = (isolation_model_instance.predict(normalized_feature_values) == -1).astype(int)


# isolation_model_instance = IsolationForest(contamination=0.03, random_state=42)
# merged_daily_behaviors['unsupervised_anomaly_score'] = isolation_model_instance.decision_function(normalized_feature_values)
merged_daily_behaviors['label_predicted_threat'] = (isolation_model_instance.predict(normalized_feature_values) == -1).astype(int)

# ===============================
# 🎓 Step 8: Supervised Classifier – Random Forest
# ===============================
X_train_split, X_test_split, y_train_split, y_test_split = train_test_split(
    unscaled_feature_matrix_for_analysis,
    merged_daily_behaviors['label_predicted_threat'],
    test_size=0.3,
    stratify=merged_daily_behaviors['label_predicted_threat'],
    random_state=42
)

rf_classifier_model_instance = RandomForestClassifier(n_estimators=100, random_state=42)
rf_classifier_model_instance.fit(X_train_split, y_train_split)

# ===============================
# 📈 Step 9: Evaluation
# ===============================
print("🧾 Threat Detection Evaluation Report:\n")
print(classification_report(y_test_split, rf_classifier_model_instance.predict(X_test_split)))

sns.heatmap(confusion_matrix(y_test_split, rf_classifier_model_instance.predict(X_test_split)), annot=True, fmt='d', cmap='Purples')
plt.title("Random Forest Confusion Matrix View")
plt.xlabel("Predicted Outcome")
plt.ylabel("Actual Outcome")
plt.show()

# 🧠 Feature Contribution View
feature_score_data_frame = pd.DataFrame({
    'Input_Feature_Name': relevant_model_input_features,
    'Importance_Score_Measured': rf_classifier_model_instance.feature_importances_
}).sort_values(by='Importance_Score_Measured', ascending=False)

plt.figure(figsize=(12, 6))
sns.barplot(x='Importance_Score_Measured', y='Input_Feature_Name', data=feature_score_data_frame)
plt.title("Relative Significance of Input Features")
plt.tight_layout()
plt.show()

# ===============================
# 💾 Step 10: Save to Disk
# ===============================
os.makedirs("ai_trained_model", exist_ok=True)
joblib.dump({
    'scaling_module': data_normalizer_instance,
    'iforest_module': isolation_model_instance,
    'random_forest_module': rf_classifier_model_instance,
    'training_input_features': relevant_model_input_features
}, 'final_hybrid_threat_model_daily.pkl')

merged_daily_behaviors.to_csv("../Datasets/final_user_feature_matrix.csv", index=False)
print(f"\n✅ Model + dataset saved with {len(merged_daily_behaviors)} entries for {merged_daily_behaviors['user'].nunique()} users.")

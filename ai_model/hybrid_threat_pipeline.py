import os
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib.pyplot as plt
import seaborn as sns

# ------------------------------
# 📁 Define dataset paths
# ------------------------------
dataset_folder_path_master = "../Datasets/"

email_csv_path = os.path.join(dataset_folder_path_master, "email.csv")
file_csv_path = os.path.join(dataset_folder_path_master, "file.csv")
logon_csv_path = os.path.join(dataset_folder_path_master, "logon.csv")
device_csv_path = os.path.join(dataset_folder_path_master, "device.csv")
psychometric_1_path = os.path.join(dataset_folder_path_master, "psychometric.csv")
psychometric_2_path = os.path.join(dataset_folder_path_master, "psychometric 2.csv")

# ------------------------------
# 📥 Load datasets
# ------------------------------
df_email_logs = pd.read_csv(email_csv_path)
df_file_logs = pd.read_csv(file_csv_path)
df_logon_logs = pd.read_csv(logon_csv_path)
df_device_logs = pd.read_csv(device_csv_path)
df_psy1 = pd.read_csv(psychometric_1_path)
df_psy2 = pd.read_csv(psychometric_2_path)

# ------------------------------
# 🔁 Merge psychometric profiles
# ------------------------------
df_psychometric_combined = pd.concat([df_psy1, df_psy2], ignore_index=True)
df_psychometric_combined.columns = [
    'employee_name', 'user_id',
    'trait_openness', 'trait_conscientiousness', 'trait_extraversion',
    'trait_agreeableness', 'trait_neuroticism']

# ------------------------------
# 🧽 Standardize datetime formats
# ------------------------------
for df, col in zip([df_email_logs, df_file_logs, df_logon_logs, df_device_logs], ['date'] * 4):
    df[col] = pd.to_datetime(df[col], errors='coerce')

# ------------------------------
# 🗓️ Add week number and aggregate
# ------------------------------
def add_week_column(df):
    df = df.copy()
    df['week'] = df['date'].dt.to_period('W').astype(str)
    return df

df_email_logs = add_week_column(df_email_logs)
df_file_logs = add_week_column(df_file_logs)
df_logon_logs = add_week_column(df_logon_logs)
df_device_logs = add_week_column(df_device_logs)

# ------------------------------
# 📊 Weekly Aggregation
# ------------------------------
df_email_weekly = df_email_logs.groupby(['user', 'week']).agg(total_emails_sent=('id', 'count')).reset_index()
df_file_weekly = df_file_logs.groupby(['user', 'week']).agg(total_files_accessed=('id', 'count')).reset_index()
df_logon_weekly = df_logon_logs.groupby(['user', 'week']).agg(total_logon_sessions=('id', 'count')).reset_index()
df_device_weekly = df_device_logs.groupby(['user', 'week']).agg(total_usb_activities=('id', 'count')).reset_index()

# ------------------------------
# 🔗 Merge all weekly behavior
# ------------------------------
df_weekly_behavior = df_email_weekly.merge(df_file_weekly, on=['user', 'week'], how='outer') \
    .merge(df_logon_weekly, on=['user', 'week'], how='outer') \
    .merge(df_device_weekly, on=['user', 'week'], how='outer')

# 🔗 Merge psychometric data
# Only merge once per user (repeat for all weeks)
df_weekly_behavior = df_weekly_behavior.merge(
    df_psychometric_combined,
    left_on='user', right_on='user_id', how='left'
)

# Fill missing values
final_weekly_feature_matrix_df = df_weekly_behavior.fillna(0)

# ------------------------------
# 🎯 Model Training Prep
# ------------------------------
feature_columns_to_use = [
    'total_emails_sent', 'total_files_accessed', 'total_logon_sessions', 'total_usb_activities',
    'trait_openness', 'trait_conscientiousness', 'trait_extraversion', 'trait_agreeableness', 'trait_neuroticism'
]

X_full_feature_matrix = final_weekly_feature_matrix_df[feature_columns_to_use]
scaler_for_weekly_features = StandardScaler()
X_scaled = scaler_for_weekly_features.fit_transform(X_full_feature_matrix)

# ------------------------------
# 🧪 Isolation Forest
# ------------------------------
isolation_forest_weekly_model = IsolationForest(contamination=0.03, random_state=42)
isolation_forest_weekly_model.fit(X_scaled)
anomaly_scores = isolation_forest_weekly_model.decision_function(X_scaled)
anomaly_labels = isolation_forest_weekly_model.predict(X_scaled)

final_weekly_feature_matrix_df['anomaly_score'] = anomaly_scores
final_weekly_feature_matrix_df['threat_label'] = (anomaly_labels == -1).astype(int)

# ------------------------------
# 🎓 Train Random Forest
# ------------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X_full_feature_matrix,
    final_weekly_feature_matrix_df['threat_label'],
    test_size=0.3,
    stratify=final_weekly_feature_matrix_df['threat_label'],
    random_state=42
)

rf_weekly_classifier = RandomForestClassifier(n_estimators=100, random_state=42)
rf_weekly_classifier.fit(X_train, y_train)

# Evaluate
y_pred = rf_weekly_classifier.predict(X_test)
print("\n📊 Weekly Threat Classification Report:\n")
print(classification_report(y_test, y_pred))

# Confusion Matrix
sns.heatmap(confusion_matrix(y_test, y_pred), annot=True, fmt='d', cmap='Purples')
plt.title("Weekly Confusion Matrix")
plt.xlabel("Predicted")
plt.ylabel("Actual")
plt.show()

# Feature Importance
feature_importances = pd.DataFrame({
    'Feature': feature_columns_to_use,
    'ImportanceScore': rf_weekly_classifier.feature_importances_
}).sort_values(by='ImportanceScore', ascending=False)

plt.figure(figsize=(10, 6))
sns.barplot(x='ImportanceScore', y='Feature', data=feature_importances)
plt.title("Weekly Feature Importances")
plt.show()

# Save Model
os.makedirs("ai_model", exist_ok=True)
joblib.dump({
    'scaler': scaler_for_weekly_features,
    'isolation_model': isolation_forest_weekly_model,
    'random_forest_model': rf_weekly_classifier,
    'features': feature_columns_to_use
}, 'hybrid_threat_model_weekly.pkl')

# Save DataFrame
final_weekly_feature_matrix_df.to_csv("../Datasets/weekly_user_feature_matrix.csv", index=False)

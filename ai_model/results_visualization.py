import pandas as pd
import matplotlib.pyplot as plt

# Load dataset
df = pd.read_csv("final_combined_dataset.csv")

# 1. Distribution of emails dispatched
plt.figure(figsize=(7,5))
df['number_of_emails_dispatched'].hist(bins=40, color='skyblue', edgecolor='black')
plt.title("Distribution of Emails Dispatched")
plt.xlabel("Emails Sent")
plt.ylabel("Count")
plt.savefig("figures/emails_distribution.png", dpi=300)
plt.show()

# 2. USB incidents per user
usb_counts = df.groupby("user")['usb_connection_incidents'].sum().sort_values(ascending=False)[:20]
usb_counts.plot(kind='bar', figsize=(10,5), color='orange')
plt.title("USB Incidents by Top 20 Users")
plt.ylabel("Count")
plt.savefig("figures/usb_by_user.png", dpi=300)
plt.show()

# 3. Day vs Night logon activity
day_night = {
    "Daytime Logons": df['total_logon_attempts'][df['is_business_hours']==1].sum(),
    "Nighttime Logons": df['total_logon_attempts'][df['is_late_night']==1].sum()
}
plt.pie(day_night.values(), labels=day_night.keys(), autopct='%1.1f%%', colors=['#4CAF50','#FF5733'])
plt.title("Day vs Night Logon Activity")
plt.savefig("figures/day_vs_night_logons.png", dpi=300)
plt.show()

# 4. Threat label distribution (ground truth)
df['predicted_threat_label'].value_counts().plot(kind='bar', color=['green','red'])
plt.title("Distribution of Threat vs Normal Labels")
plt.xlabel("Class (0=Normal, 1=Threat)")
plt.ylabel("Count")
plt.savefig("figures/threat_label_distribution.png", dpi=300)
plt.show()

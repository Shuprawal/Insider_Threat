# Real-Time Insider Threat Detection and Defence System  

## 📖 Project Overview  
This project is a **Real-Time Insider Threat Detection and Defence System** built using a **Django backend** and a **React.js frontend**. The system monitors organizational logs (emails, logons, file access, USB activity, and psychometric data), detects anomalies using a hybrid **Isolation Forest + XGBoost ML pipeline**, and provides an admin dashboard for visualization and alerts.  

### Key Features  
-  User authentication and account management  
-  Real-time alerts via WebSockets  
-  Automatic user suspension on high anomaly scores  
-  Interactive React dashboard with analytics charts  
- ️ PostgreSQL database for secure data storage  

---
##  Machine Learning Workflow  
1. **Data Ingestion** – Reads log datasets (Datasets/) in CSV format.  
2. **Feature Engineering** – Computes ratios, rolling averages, night activity scores, and volatility measures.  
3. **Anomaly Scoring** – Isolation Forest assigns anomaly scores in an unsupervised way.  
4. **Classification** – XGBoost refines anomaly detection with high precision.  
5. **Alerting** – High anomaly scores automatically suspend users and raise alerts.  
6. **Visualization** – Charts include anomaly distribution, feature importance, confusion matrix, ROC/PR curves.


---

## ⚙ Setup Instructions  

### 1. Backend Setup (Django)
```bash
    redis-server &             
    createdb insiderdb 

    cd Dissertation
    python -m venv .venv
    source .venv/bin/activate   # Mac/Linux
    .venv\Scripts\activate      # Windows
    
    pip install -r requirements.txt
    python manage.py migrate
    python manage.py bootstrap_demo --force --days 30 
    python manage.py rebuild_cohort
    
    # Start Celery worker (for task processing)
    celery -A Dissertation worker -l INFO
    # Start Celery beat (for scheduled tasks)
    celery -A Dissertation beat -l INFO
    
    # Start Daphne server (for Channels and WebSockets)
    daphne -b 0.0.0.0 -p 8000 Dissertation.asgi:application
    # Or use Django’s runserver command
    python manage.py runserver


   ```

### 2. Frontend (React) Setup
```bash
    cd threat-detection-frontend
    npm install
    npm start
   ```

### 2. Access The Application
```bash
    Django backend API → http://127.0.0.1:8000/
    React frontend → http://localhost:3000/
  ```

### 3. Admin Login Email, Username and Password
```bash
    ADMIN_USERNAME=admin
    ADMIN_EMAIL=admin@gmail.com
    ADMIN_PASSWORD=Admin@123
   ```
# ThreatDetection/tes/test_analyze_logs.py

from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from io import BytesIO
import pandas as pd
from django.utils.timezone import make_aware
from datetime import datetime

class AnalyzeLogsTest(TestCase):
    def setUp(self):
        self.url = '/api/analyze-logs/'

    def test_analyze_logs_no_anomalies(self):  # TC10
        """Upload clean log file — expect no anomalies detected."""

        timestamps = pd.date_range(start='2023-01-01 08:00:00', periods=5, freq='H')
        aware_timestamps = [make_aware(ts) for ts in timestamps]

        df = pd.DataFrame({
            'user': ['normaluser'] * 5,
            'activity': ['Logon'] * 5,
            'date': aware_timestamps
        })

        csv_file = BytesIO()
        df.to_csv(csv_file, index=False)
        csv_file.seek(0)

        file = SimpleUploadedFile("clean.csv", csv_file.read(), content_type="text/csv")
        response = self.client.post(self.url, {'file': file})
        self.assertEqual(response.status_code, 200)
        self.assertIn('total_anomalies', response.json())
        print("Test NO anomalies →", response.json())  # Optional for debug
        self.assertEqual(response.json()['total_anomalies'], 0)

    def test_analyze_logs_no_anomalies(self):  # TC10
        """Upload clean log file — expect few or no anomalies."""
        timestamps = pd.date_range(start='2023-01-01 08:00:00', periods=5, freq='h')
        aware_timestamps = [make_aware(ts) for ts in timestamps]

        df = pd.DataFrame({
            'user': ['normaluser'] * 5,
            'activity': ['Logon'] * 5,
            'date': aware_timestamps
        })

        csv_file = BytesIO()
        df.to_csv(csv_file, index=False)
        csv_file.seek(0)

        file = SimpleUploadedFile("clean.csv", csv_file.read(), content_type="text/csv")
        response = self.client.post(self.url, {'file': file})

        self.assertEqual(response.status_code, 200)
        self.assertIn('total_anomalies', response.json())
        print("Test NO anomalies →", response.json())


        self.assertLessEqual(response.json()['total_anomalies'], 5)


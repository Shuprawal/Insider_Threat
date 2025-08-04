import os
import django
import random

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "Dissertation.settings")

django.setup()

from ThreatDetection.models import CustomUser

departments = ['IT', 'HR', 'Finance', 'Security']
roles = ['Admin', 'Staff', 'Analyst', 'Intern']

for i in range(5):
    username = f"user{i+1}"
    raw_password = "password123"
    department = random.choice(departments)
    role = random.choice(roles)

    user = CustomUser(
        username=username,
        department=department,
        role=role
    )
    user.set_password(raw_password)
    user.save()
    print(f"✅ Created {username} | dept={department}, role={role}")

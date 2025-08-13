import smtplib

smtp_server = "smtp.gmail.com"
port = 587
sender_email = "shuprawal360@gmail.com"
password = "wfcjqtphvllvltac"
receiver_email = "showankarki121@gmail.com"

try:
    server = smtplib.SMTP(smtp_server, port)
    server.starttls()
    server.login(sender_email, password)
    message = "Subject: Test\n\nThis is a test email from Python SMTP."
    server.sendmail(sender_email, receiver_email, message)
    print("✅ Email sent successfully!")
    server.quit()
except Exception as e:
    print("❌ Failed to send email:", e)

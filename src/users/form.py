from django import forms

from ThreatDetection.models import CustomUser


class RegistrationForm(forms.ModelForm):
    class Meta:
        model = CustomUser
        # Include all fields you actually collect in React:
        fields = [
            'username', 'email', 'department', 'role',
            'first_name', 'last_name', 'address', 'profile_picture'
        ]

    def clean_username(self):
        username = self.cleaned_data['username'].strip()
        if len(username) < 4:
            raise forms.ValidationError("Username must be at least 4 characters long.")

        if CustomUser.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError("Username is already taken.")
        return username

    def clean_email(self):
        email = self.cleaned_data['email'].strip().lower()
        if not email:
            raise forms.ValidationError("Email is required.")
        if CustomUser.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Email is already registered.")
        return email

# from django import forms
#
# class DateRangeForm(forms.Form):
#     start_date = forms.DateField(
#         required=False,
#         widget=forms.DateInput(attrs={'type': 'date'}),
#         input_formats=['%Y-%m-%d']
#     )
#     end_date = forms.DateField(
#         required=False,
#         widget=forms.DateInput(attrs={'type': 'date'}),
#         input_formats=['%Y-%m-%d']
#     )
#
#     def clean(self):
#         cleaned_data = super().clean()
#         start = cleaned_data.get('start_date')
#         end = cleaned_data.get('end_date')
#
#         if start and end and start > end:
#             raise forms.ValidationError("Start date must be before end date.")
#         return cleaned_data

# src/dashboard/forms.py
from django import forms

ISO_INPUTS = [
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%S.%f%z",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%MZ",
    "%Y-%m-%dT%H:%M%z",
]

DATE_ONLY_INPUTS = [
    "%Y-%m-%d",  # 2025-08-15
    "%d/%m/%Y",  # 15/08/2025 (if your picker ever sends this)
]

class DateRangeForm(forms.Form):
    # DateTimeField so ISO strings validate; also accepts plain dates
    start_date = forms.DateTimeField(
        required=False,
        input_formats=ISO_INPUTS + DATE_ONLY_INPUTS,
    )
    end_date = forms.DateTimeField(
        required=False,
        input_formats=ISO_INPUTS + DATE_ONLY_INPUTS,
    )

    def clean(self):
        cleaned = super().clean()
        start = cleaned.get("start_date")
        end   = cleaned.get("end_date")
        if start and end and start > end:
            raise forms.ValidationError("Start date must be before end date.")
        return cleaned

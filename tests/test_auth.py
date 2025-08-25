# tests/test_auth.py
import jwt
import time
import pytest
from django.test import RequestFactory
from ThreatDetection.auth_utils import generate_auth_token, get_user_from_auth_token
from ThreatDetection.views import get_authenticated_user
from django.conf import settings


def test_token_roundtrip(user):
    token = generate_auth_token(user)
    rf = RequestFactory()
    req = rf.get("/x", HTTP_AUTHORIZATION=f"Bearer {token}")
    got = get_authenticated_user(req)
    assert got and got.id == user.id, (" Valid token should "
                                       "authenticate the correct user")
    print("Test Passed: Valid token roundtrip "
          "authentication works as expected ")


def test_invalid_header_returns_none():
    rf = RequestFactory()
    req = rf.get("/x")  # no header
    result = get_authenticated_user(req)
    assert result is None, (" Request without"
                            " token should return None")
    print("Test Passed: Missing/invalid Authorization"
          " header correctly returns None ")


def test_expired_token(user, settings):
    # forge an already-expired token
    payload = {"user_id": user.id, "exp": 0, "iat": 0}
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    rf = RequestFactory()
    req = rf.get("/x", HTTP_AUTHORIZATION=f"Bearer {token}")
    result = get_authenticated_user(req)
    assert result is None, " Expired token should not authenticate the user"
    print("Test Passed: Expired token is correctly rejected ")

def test_get_user_from_auth_token_happy_path(user, rf):
    token = generate_auth_token(user)
    req = rf.get("/y", HTTP_AUTHORIZATION=f"Bearer {token}")
    got = get_user_from_auth_token(req)
    assert got and got.id == user.id, ("get_user_from_auth_token"
                                       " should return the same user")
    print("Test Passed: get_user_from_auth_token returned id =", got.id)
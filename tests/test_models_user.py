# tests/test_models_user.py

def test_password_hash_and_check(user):

    assert user.check_password("secret") is True,\
        " Correct password should validate successfully"
    print("Test Passed: Correct password validated successfully ")

    # wrong password should fail
    assert user.check_password("wrong") is False, \
        " Wrong password should be rejected"
    print("Test Passed: Wrong password rejected ")

    # stored password should be 64-char SHA256 hex
    assert len(user.password) == 64, \
        " Password is stored as 64-character SHA256 hash"
    print("Test Passed: Password stored securely as SHA256 hash ")


def test_str_returns_username(user):
    # __str__ should return username
    assert str(user) == "alice", \
        " String representation should return username"
    print("Test Passed: __str__ returns correct username ")

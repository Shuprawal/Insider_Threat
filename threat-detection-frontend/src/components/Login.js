import React, { useState } from 'react';
import api from './api';
import {
  saveTokenToStorageMain,
  saveAuthPayloadToStorageMain
} from './authStorage';
import { Link, useNavigate } from 'react-router-dom';
import '../App.css';

function Login({ setAuth }) {
  const [loginIdentifierValue, setLoginIdentifierValue] = useState('');
  const [loginPasswordValue, setLoginPasswordValue] = useState('');
  const [rememberMeFlagValue, setRememberMeFlagValue] = useState(true);
  const [loginErrorMessageValue, setLoginErrorMessageValue] = useState('');
  const [isLoginSubmittingState, setIsLoginSubmittingState] = useState(false);
  const navigate = useNavigate();

  const handleLoginFormSubmit = async (e) => {
    e.preventDefault();
    setIsLoginSubmittingState(true);
    setLoginErrorMessageValue('');
    try {
      const { data } = await api.post('/api/custom-login/', {
        identifier: loginIdentifierValue.trim(),
        password: loginPasswordValue,
      });

      if (data?.token) {
        saveTokenToStorageMain(data.token, rememberMeFlagValue);
        saveAuthPayloadToStorageMain(data.user);

        setAuth?.(true);
        navigate(data.redirect_to || '/', { replace: true });
      } else {
        setLoginErrorMessageValue('No token received from server.');
      }
    } catch (err) {
      setLoginErrorMessageValue(err.response?.data?.error || 'Invalid credentials. Please try again.');
    } finally {
      setIsLoginSubmittingState(false);
    }
  };

  return (
    <div className="itddsLoginPage-outerContainerBackgroundGradient">
      <div className="itddsLoginCard-surfaceShadowRounded">
        <h2 className="itddsLogin-headingPrimary">Insider Threat Detection</h2>
        <p className="itddsLogin-subheadingSecondary">Secure Access Portal</p>

        {loginErrorMessageValue && (
          <div className="itddsLogin-errorContainerProminent">
            <p>{loginErrorMessageValue}</p>
          </div>
        )}

        <form onSubmit={handleLoginFormSubmit} className="itddsLogin-formVerticalSpacing">
          <div className="itddsLogin-formGroupBlock">
            <label className="itddsLogin-labelTextReadable">
              Email or Username
            </label>
            <input
              type="text"
              value={loginIdentifierValue}
              onChange={(e) => setLoginIdentifierValue(e.target.value)}
              className="itddsLogin-inputFieldEmphasizedVisibility"
              required
              autoComplete="username"
              inputMode="email"
            />
          </div>

          <div className="itddsLogin-formGroupBlock">
            <label className="itddsLogin-labelTextReadable">
              Password
            </label>
            <input
              type="password"
              value={loginPasswordValue}
              onChange={(e) => setLoginPasswordValue(e.target.value)}
              className="itddsLogin-inputFieldEmphasizedVisibility"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="itddsLogin-rowBetweenCheckboxAndLink">
            <label className="itddsLogin-checkboxWithLabelContainer">
              <input
                type="checkbox"
                checked={rememberMeFlagValue}
                onChange={(e) => setRememberMeFlagValue(e.target.checked)}
                className="itddsLogin-checkboxInputVisible"
              />
              Remember me on this device
            </label>

            <Link to="/forgot-password" className="itddsLogin-linkSubtleAction">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoginSubmittingState}
            className="itddsLogin-submitButtonPrimary"
          >
            {isLoginSubmittingState ? 'Logging in...' : 'Secure Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;

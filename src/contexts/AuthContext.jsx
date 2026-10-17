import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from "sonner";
import { auth as authAPI } from '../api';

const AuthContext = createContext();

const normalizeUser = (user) => {
  if (!user) return null;
  const fallbackName = user.email?.split('@')[0] || 'ShareT user';
  const fullName = String(user.fullName || user.name || fallbackName).trim() || fallbackName;
  const createdAt = user.createdAt && !Number.isNaN(new Date(user.createdAt).getTime())
    ? user.createdAt
    : null;

  return {
    ...user,
    name: fullName,
    fullName,
    createdAt,
  };
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  // Check for existing session on load
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // Verify token and get current user from backend
          const response = await authAPI.getCurrentUser();
          if (response.success) {
            const user = normalizeUser(response.user || response.data?.user || response.data);
            setCurrentUser(user);
            // Update localStorage with fresh user data
            localStorage.setItem('sharetUser', JSON.stringify(user));
          } else {
            // Token is invalid, clear it
            localStorage.removeItem('token');
            localStorage.removeItem('sharetUser');
          }
        } catch (error) {
          console.error('Failed to verify session', error);
          // Clear invalid token
          localStorage.removeItem('token');
          localStorage.removeItem('sharetUser');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  // Sign up function - now uses backend API
  const signUp = async (email, password, fullName) => {
    setLoading(true);
    try {
      const response = await authAPI.register({
        email,
        password,
        name: fullName
      });

      if (response.success) {
        const { token } = response;
        const user = normalizeUser(response.user);
        
        // Store JWT token
        localStorage.setItem('token', token);
        
        // Store user data
        localStorage.setItem('sharetUser', JSON.stringify(user));
        setCurrentUser(user);
        
        toast.success("Account created successfully");
        navigate('/app');
        return user;
      } else {
        throw new Error(response.message || response.error || 'Registration failed');
      }
    } catch (error) {
      const errorMessage = error.message || "Failed to create account";
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Sign in function - now uses backend API
  const signIn = async (email, password) => {
    setLoading(true);
    try {
      const response = await authAPI.login({
        email,
        password
      });

      if (response.success) {
        const { token } = response;
        const user = normalizeUser(response.user);
        
        // Store JWT token
        localStorage.setItem('token', token);
        
        // Store user data
        localStorage.setItem('sharetUser', JSON.stringify(user));
        setCurrentUser(user);
        
        toast.success("Signed in successfully");
        navigate('/app');
        return user;
      } else {
        throw new Error(response.message || response.error || 'Login failed');
      }
    } catch (error) {
      const errorMessage = error.message || "Failed to sign in";
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Sign out function - now calls backend API
  const signOut = async () => {
    try {
      // Call backend logout endpoint
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with local logout even if API call fails
    } finally {
      // Clear local storage
      localStorage.removeItem('token');
      localStorage.removeItem('sharetUser');
      setCurrentUser(null);
      toast.success("Signed out successfully");
      navigate('/');
    }
  };

  // Update user profile
  const updateProfile = async (profileData) => {
    setLoading(true);
    try {
      const response = await authAPI.updateProfile(profileData);
      
      if (response.success) {
        const updatedUser = normalizeUser(response.user || response.data?.user || response.data);
        setCurrentUser(updatedUser);
        localStorage.setItem('sharetUser', JSON.stringify(updatedUser));
        toast.success("Profile updated successfully");
        return updatedUser;
      } else {
        throw new Error(response.message || response.error || 'Profile update failed');
      }
    } catch (error) {
      const errorMessage = error.message || "Failed to update profile";
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Reset password (forgot password flow)
  const resetPassword = async (email) => {
    try {
      const response = await authAPI.forgotPassword(email);
      if (!response.success) {
        throw new Error(response.message || 'Failed to send reset email');
      }
      return response;
    } catch (error) {
      const errorMessage = error.message || 'Failed to send reset email';
      if (!error.message?.includes('reset link')) {
        toast.error(errorMessage);
      }
      throw error;
    }
  };

  // Change password
  const changePassword = async (currentPassword, newPassword) => {
    setLoading(true);
    try {
      const response = await authAPI.changePassword({
        currentPassword,
        newPassword
      });
      
      if (response.success) {
        toast.success("Password changed successfully");
        return true;
      } else {
        throw new Error(response.message || response.error || 'Password change failed');
      }
    } catch (error) {
      const errorMessage = error.message || "Failed to change password";
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    currentUser,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    changePassword,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


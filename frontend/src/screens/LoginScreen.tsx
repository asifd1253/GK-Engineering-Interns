import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DataStorage, API_BASE_URL } from '../utils/storage';
import { User } from '../types';
import { useToast } from '../context';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isCompact = width < 820;

  const canSubmit = username.trim().length > 0 && password.length > 0 && !isLoggingIn;

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      showToast({ message: 'Enter your username and password.', type: 'error' });
      return;
    }

    try {
      setIsLoggingIn(true);
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username.trim(), password: password })
      });

      if (response.ok) {
        const data = await response.json();
        // The backend returns { access_token, user: { ... } }
        const loggedUser = { ...data.user, token: data.access_token, role: data.user.role.toLowerCase() };
        await DataStorage.setCurrentUser(loggedUser);
        showToast({ message: `Welcome, ${loggedUser.name || loggedUser.email || 'User'}!`, type: 'success' });
        onLogin(loggedUser);
      } else {
        showToast({ message: 'Invalid credentials', type: 'error' });
      }
    } catch (err) {
      showToast({ message: 'Unable to reach backend server.', type: 'error' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.shell, isCompact && styles.shellCompact]}>
          <View style={[styles.brandPanel, isCompact && styles.brandPanelCompact]}>
            <View style={styles.brandTopRow}>
              <View style={styles.logoTile}>
                <Image
                  source={require('../assets/wimera-logo.png')}
                  style={styles.logoMark}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Secure access</Text>
              </View>
            </View>

            <View style={styles.brandCopy}>
              <Text style={styles.eyebrow}>GK Engineering</Text>
              <Text style={[styles.heroTitle, isCompact && styles.heroTitleCompact]}>
                Production control, ready when your shift starts.
              </Text>
              <Text style={[styles.heroSubtitle, isCompact && styles.heroSubtitleCompact]}>
                Sign in to manage work orders, inventory, quality checks, and process flow from one operations workspace.
              </Text>
            </View>

            <View style={[styles.featureGrid, isCompact && styles.featureGridCompact]}>
              <View style={styles.featureItem}>
                <Ionicons name="shield-checkmark" size={18} color="#0f766e" />
                <Text style={styles.featureText}>Role based access</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="analytics" size={18} color="#00877f" />
                <Text style={styles.featureText}>Live production view</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-done" size={18} color="#c2410c" />
                <Text style={styles.featureText}>Quality traceability</Text>
              </View>
            </View>
          </View>

          <View style={[styles.formPanel, isCompact && styles.formPanelCompact]}>
            <Image
              source={require('../assets/wimera-logo.png')}
              style={styles.formLogo}
              resizeMode="contain"
            />
            <Text style={styles.formTitle}>Welcome back</Text>
            <Text style={styles.formSubtitle}>Use your assigned account credentials to continue.</Text>

            <View style={styles.formFields}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Username or email</Text>
                <View style={[styles.inputWrap, focusedField === 'email' && styles.inputWrapFocused]}>
                  <Ionicons name="mail-outline" size={20} color={focusedField === 'email' ? '#00877f' : '#5b7773'} />
                  <TextInput
                    style={styles.input}
                    placeholder="name@company.com"
                    placeholderTextColor="#7a9692"
                    value={username}
                    onChangeText={setUsername}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="username"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Password</Text>
                <View style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}>
                  <Ionicons name="lock-closed-outline" size={20} color={focusedField === 'password' ? '#00877f' : '#5b7773'} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter password"
                    placeholderTextColor="#7a9692"
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setShowPassword((visible) => !visible)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#5b7773" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {isLoggingIn ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.submitText}>Sign in</Text>
                  <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                </>
              )}
            </TouchableOpacity>

            <View style={styles.footerNote}>
              <Ionicons name="lock-closed" size={14} color="#5b7773" />
              <Text style={styles.footerText}>Protected operations workspace</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#eef3f8',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: 1100,
    minHeight: 620,
    alignSelf: 'center',
    flexDirection: 'row',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ef',
    boxShadow: '0px 24px 70px rgba(15, 23, 42, 0.16)',
    elevation: 8,
  },
  shellCompact: {
    minHeight: 0,
    flexDirection: 'column',
    borderRadius: 22,
  },
  brandPanel: {
    flex: 1.15,
    backgroundColor: '#083d3a',
    padding: 38,
    justifyContent: 'space-between',
  },
  brandPanelCompact: {
    padding: 24,
    gap: 28,
  },
  brandTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  logoTile: {
    width: 116,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  logoMark: {
    width: 88,
    height: 38,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  statusText: {
    color: '#d9f3f0',
    fontSize: 12,
    fontWeight: '700',
  },
  brandCopy: {
    maxWidth: 530,
  },
  eyebrow: {
    color: '#8de0d9',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '900',
  },
  heroTitleCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  heroSubtitle: {
    color: '#c8dbd8',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 18,
  },
  heroSubtitleCompact: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureGridCompact: {
    display: 'none',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  featureText: {
    color: '#d7e6e4',
    fontSize: 13,
    fontWeight: '700',
  },
  formPanel: {
    flex: 0.85,
    minWidth: 360,
    padding: 40,
    justifyContent: 'center',
  },
  formPanelCompact: {
    minWidth: 0,
    padding: 24,
  },
  formLogo: {
    width: 190,
    height: 50,
    marginBottom: 26,
  },
  formTitle: {
    color: '#083d3a',
    fontSize: 30,
    fontWeight: '900',
  },
  formSubtitle: {
    color: '#5b7773',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 30,
  },
  formFields: {
    gap: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: '#315451',
    fontSize: 13,
    fontWeight: '800',
  },
  inputWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4ef',
    backgroundColor: '#f7fbfa',
    paddingHorizontal: 14,
  },
  inputWrapFocused: {
    borderColor: '#00877f',
    backgroundColor: '#ffffff',
    boxShadow: '0px 8px 24px rgba(29, 78, 216, 0.12)',
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: '#083d3a',
    fontSize: 15,
    outlineStyle: 'none' as any,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#00877f',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 26,
    boxShadow: '0px 14px 24px rgba(29, 78, 216, 0.26)',
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#7a9692',
    boxShadow: 'none',
    elevation: 0,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 22,
  },
  footerText: {
    color: '#5b7773',
    fontSize: 12,
    fontWeight: '700',
  },
});

import 'react-native-gesture-handler';
import './global.css';
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { DrawerNavigator } from './src/navigation/DrawerNavigator';
import { LoginScreen } from './src/screens/LoginScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastProvider, ConfirmProvider, AuthProvider, useAuth } from './src/context';

function AppContent() {
  const { user, loading, logout, login, refreshUser } = useAuth();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUser();
    });
    return () => sub.remove();
  }, [refreshUser]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7fbfa' }}>
        <ActivityIndicator color="#00877f" />
        <Text style={{ marginTop: 12, color: '#486966', fontSize: 14 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? (
        <DrawerNavigator user={user} onLogout={logout} />
      ) : (
        <LoginScreen onLogin={login} />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AppContent />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

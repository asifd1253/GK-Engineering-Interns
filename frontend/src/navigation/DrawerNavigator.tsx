import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, useWindowDimensions, Image } from 'react-native';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DataStorage } from '../utils/storage';
import { useToast } from '../context';
import { canView, isSuperAdmin, isTenantAdmin } from '../utils/permissions';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ConfigurationScreen } from '../screens/ConfigurationScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { WorkOrderScreen } from '../screens/WorkOrderScreen';
import { ProductionProcessScreen } from '../screens/ProductionProcessScreen';
import { ProcessInventoryScreen } from '../screens/ProcessInventoryScreen';
import { ClientsScreen } from '../screens/ClientsScreen';
import { QualityScreen } from '../screens/QualityScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { MachineAnalyticsScreen } from '../screens/MachineAnalyticsScreen';
import { InventoryLedgerScreen } from '../screens/InventoryLedgerScreen';
import { User } from '../types';

const Drawer = createDrawerNavigator();

interface DrawerNavigatorProps {
  user: User;
  onLogout: () => void;
}

// Menu icons per screen — access is now controlled purely by permissions
const SCREEN_ICONS: Record<string, string> = {
  Dashboard: 'view-dashboard-outline',
  'Process Inventory': 'clipboard-pulse-outline',
  'Inventory Ledger': 'table-large',
  Analytics: 'chart-box-outline',
  Inventory: 'package-variant-closed',
  Schedules: 'calendar-month-outline',
  'Work Orders': 'clipboard-list-outline',
  Pipeline: 'factory',
  Quality: 'shield-check-outline',
  Reports: 'chart-bar',
  Configuration: 'cog-outline',
  Clients: 'domain',
};

// Role colors for badge — fallback for unknown roles
const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: '#d9f3f0', text: '#006b65' },
  tenant_admin: { bg: '#ede9fe', text: '#5b21b6' },
  inventory_user: { bg: '#d9f3f0', text: '#006b65' },
  inventory_qi: { bg: '#ecfdf5', text: '#065f46' },
  pdc_manager: { bg: '#fce7f3', text: '#9d174d' },
  pdc_diecasting: { bg: '#fce7f3', text: '#9d174d' },
  qi_diecasting: { bg: '#ecfdf5', text: '#065f46' },
  pdc_coating: { bg: '#fce7f3', text: '#9d174d' },
  qi_coating: { bg: '#ecfdf5', text: '#065f46' },
  pdc_machining: { bg: '#fce7f3', text: '#9d174d' },
  qi_machining: { bg: '#ecfdf5', text: '#065f46' },
  final_qi: { bg: '#fef9c3', text: '#713f12' },
};

function getInitials(name: string, username: string) {
  if (name) return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (username || '?').slice(0, 2).toUpperCase();
}

function CustomDrawerContent(
  props: DrawerContentComponentProps & { user: User; onLogout: () => void }
) {
  const { user, state, navigation } = props;
  const initials = getInitials(user.name, user.username);
  const roleStyle = ROLE_COLORS[user.role] ?? { bg: '#edf5f4', text: '#315451' };
  const currentRoute = state.routeNames[state.index];

  // Build visible sections dynamically from permissions
  const overviewItems = [
    canView(user, 'dashboard') && { name: 'Dashboard', icon: SCREEN_ICONS.Dashboard },
    isTenantAdmin(user) && { name: 'Process Inventory', icon: SCREEN_ICONS['Process Inventory'] },
    isTenantAdmin(user) && { name: 'Inventory Ledger', icon: SCREEN_ICONS['Inventory Ledger'] },
    canView(user, 'analytics') && { name: 'Analytics', icon: SCREEN_ICONS.Analytics },
  ].filter(Boolean) as { name: string; icon: string }[];

  const operationItems = [
    canView(user, 'inventory') && { name: 'Inventory', icon: SCREEN_ICONS.Inventory },
    canView(user, 'schedules') && { name: 'Schedules', icon: SCREEN_ICONS.Schedules },
    canView(user, 'workorders') && { name: 'Work Orders', icon: SCREEN_ICONS['Work Orders'] },
    canView(user, 'pipeline') && { name: 'Pipeline', icon: SCREEN_ICONS.Pipeline },
    canView(user, 'quality') && { name: 'Quality', icon: SCREEN_ICONS.Quality },
    canView(user, 'reports') && { name: 'Reports', icon: SCREEN_ICONS.Reports },
  ].filter(Boolean) as { name: string; icon: string }[];

  const adminItems = [
    (isTenantAdmin(user) || canView(user, 'configuration')) && { name: 'Configuration', icon: SCREEN_ICONS.Configuration },
    canView(user, 'clients') && { name: 'Clients', icon: SCREEN_ICONS.Clients },
  ].filter(Boolean) as { name: string; icon: string }[];

  const sections = [
    { label: 'OVERVIEW', items: overviewItems },
    { label: 'OPERATIONS', items: operationItems },
    { label: 'ADMINISTRATION', items: adminItems },
  ].filter(s => s.items.length > 0);

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ flex: 1, paddingTop: 8 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={drawerStyles.profileCard}>
        <View style={drawerStyles.logoRow}>
          <View style={drawerStyles.logoBox}>
            <Image source={require('../assets/wimera-logo.png')} style={drawerStyles.logoImage} resizeMode="contain" />
          </View>
          <View>
            <Text style={drawerStyles.companyName}>
              {user.email === 'admin@wimera.com' ? 'Wimera Systems' : (user.tenantName || 'GK Manufacturing')}
            </Text>
            <Text style={drawerStyles.companyTagline}>
              {user.email === 'admin@wimera.com' ? 'Central Management' : 'Production System v1.0'}
            </Text>
          </View>
        </View>
        <View style={drawerStyles.divider} />
        <View style={drawerStyles.userRow}>
          <View style={drawerStyles.avatar}>
            <Text style={drawerStyles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={drawerStyles.userName}>{user.name || user.username}</Text>
            <View style={[drawerStyles.roleBadge, { backgroundColor: roleStyle.bg }]}>
              <Text style={[drawerStyles.roleText, { color: roleStyle.text }]}>
                {user.role?.replace(/_/g, ' ').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={drawerStyles.navContainer}>
        {sections.map(section => (
          <View key={section.label} style={drawerStyles.section}>
            <Text style={drawerStyles.sectionLabel}>{section.label}</Text>
            {section.items.map(item => {
              const isActive = currentRoute === item.name;
              return (
                <TouchableOpacity
                  key={item.name}
                  style={[drawerStyles.menuItem, isActive && drawerStyles.menuItemActive]}
                  onPress={() => navigation.navigate(item.name)}
                  activeOpacity={0.7}
                >
                  <View style={[drawerStyles.menuIconBox, isActive ? drawerStyles.menuIconBoxActive : drawerStyles.menuIconBoxInactive]}>
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={20}
                      color={isActive ? '#00877f' : '#5b7773'}
                    />
                  </View>
                  <Text style={[drawerStyles.menuLabel, isActive && drawerStyles.menuLabelActive]}>
                    {item.name}
                  </Text>
                  {isActive && <View style={drawerStyles.activeIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ marginTop: 'auto', padding: 16 }}>
        <Text style={drawerStyles.versionText}>
          © 2026 {user.email === 'admin@wimera.com' ? 'Wimera Systems' : (user.tenantName || 'GK Manufacturing')}
        </Text>
      </View>
    </DrawerContentScrollView>
  );
}

export function DrawerNavigator({ user, onLogout }: DrawerNavigatorProps) {
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024; // Use 1024px for tablet/desktop split

  const handleLogout = async () => {
    await DataStorage.setCurrentUser(null);
    showToast({ message: 'Logged out successfully.', type: 'success' });
    onLogout();
  };

  const initials = getInitials(user.name, user.username);
  const userIsSuperAdmin = isSuperAdmin(user);

  // Determine starting route based on top accessible module
  const initialRoute = (() => {
    if (userIsSuperAdmin) return 'Clients';
    if (canView(user, 'dashboard')) return 'Dashboard';
    if (canView(user, 'analytics')) return 'Analytics';
    if (canView(user, 'inventory')) return 'Inventory';
    if (canView(user, 'schedules')) return 'Schedules';
    if (canView(user, 'workorders')) return 'Work Orders';
    if (canView(user, 'pipeline')) return 'Pipeline';
    if (canView(user, 'quality')) return 'Quality';
    if (canView(user, 'reports')) return 'Reports';
    if (isTenantAdmin(user) || canView(user, 'configuration')) return 'Configuration';
    if (canView(user, 'clients')) return 'Clients';
    return 'NoAccess';
  })();

  return (
    <>
      <Drawer.Navigator
        key={`${user.id}-${user.role}-${JSON.stringify(user.permissions)}`}
        initialRouteName={initialRoute}
        drawerContent={(props) => (
          <CustomDrawerContent {...props} user={user} onLogout={handleLogout} />
        )}
        screenOptions={({ navigation }) => ({
          headerTitle: userIsSuperAdmin ? 'System Administration' : (user.tenantName || 'Manufacturing'),
          headerStyle: { backgroundColor: '#ffffff', shadowColor: 'transparent', elevation: 0, borderBottomWidth: 1, borderBottomColor: '#d7e6e4' } as any,
          headerTintColor: '#00877f',
          headerTitleStyle: { fontSize: 17, fontWeight: '700', color: '#083d3a' },
          drawerActiveBackgroundColor: 'transparent',
          drawerActiveTintColor: '#00877f',
          drawerInactiveTintColor: '#486966',
          drawerStyle: { backgroundColor: '#f7fbfa', width: drawerOpen ? (isLargeScreen ? 286 : 300) : 0, borderRightWidth: drawerOpen ? 1 : 0, borderRightColor: '#d7e6e4' },
          drawerType: 'permanent',
          overlayColor: 'rgba(15,23,42,0.3)',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => setDrawerOpen(prev => !prev)}
              style={{ paddingHorizontal: 16, paddingVertical: 8 }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="menu" size={24} color="#083d3a" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, zIndex: 5000 }}>
              <TouchableOpacity
                style={drawerStyles.headerRight}
                onPress={() => setShowDropdown(!showDropdown)}
              >
                <View style={drawerStyles.headerAvatar}>
                  <Text style={drawerStyles.headerAvatarText}>{initials}</Text>
                </View>
                <View style={drawerStyles.headerUserInfo}>
                  <Text style={drawerStyles.headerUserName}>{user.name || user.username}</Text>
                  <Text style={drawerStyles.headerUserRole}>
                    {user.role?.replace(/_/g, ' ')}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={showDropdown ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#5b7773"
                />
              </TouchableOpacity>

              {showDropdown && (
                <View style={dropdownStyles.dropdown}>
                  <TouchableOpacity
                    style={[dropdownStyles.item, { marginTop: 4 }]}
                    onPress={() => { setShowDropdown(false); handleLogout(); }}
                  >
                    <MaterialCommunityIcons name="logout" size={18} color="#dc2626" />
                    <Text style={[dropdownStyles.itemText, { color: '#dc2626', fontWeight: '700' }]}>Sign Out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ),
        })}
      >
        {/* Super Admin — only sees client management */}
        {userIsSuperAdmin && (
          <Drawer.Screen name="Clients" component={ClientsScreen} options={{ drawerLabel: 'Deployed Clients' }} />
        )}

        {/* Tenant users — screens shown based on permissions */}
        {!userIsSuperAdmin && (
          <>
            {canView(user, 'dashboard') && (
              <Drawer.Screen name="Dashboard" component={DashboardScreen} />
            )}
            {isTenantAdmin(user) && (
              <Drawer.Screen name="Process Inventory" component={ProcessInventoryScreen} />
            )}
            {isTenantAdmin(user) && (
              <Drawer.Screen name="Inventory Ledger" component={InventoryLedgerScreen} />
            )}
            {canView(user, 'analytics') && (
              <Drawer.Screen name="Analytics" component={MachineAnalyticsScreen} options={{ drawerLabel: 'Machine Analytics' }} />
            )}
            {canView(user, 'inventory') && (
              <Drawer.Screen name="Inventory">
                {(props) => <InventoryScreen {...props} user={user} />}
              </Drawer.Screen>
            )}
            {canView(user, 'schedules') && (
              <Drawer.Screen name="Schedules" component={ScheduleScreen} />
            )}
            {canView(user, 'workorders') && (
              <Drawer.Screen name="Work Orders" component={WorkOrderScreen} />
            )}
            {canView(user, 'pipeline') && (
              <Drawer.Screen name="Pipeline" component={ProductionProcessScreen} />
            )}
            {canView(user, 'quality') && (
              <Drawer.Screen name="Quality" component={QualityScreen} />
            )}
            {canView(user, 'reports') && (
              <Drawer.Screen name="Reports" component={ReportsScreen} />
            )}
            {(isTenantAdmin(user) || canView(user, 'configuration')) && (
              <Drawer.Screen name="Configuration" component={ConfigurationScreen} options={{ drawerLabel: 'Configuration' }} />
            )}
            {canView(user, 'clients') && (
              <Drawer.Screen name="Clients" component={ClientsScreen} options={{ drawerLabel: 'Client Management' }} />
            )}
            {initialRoute === 'NoAccess' && (
              <Drawer.Screen name="NoAccess" options={{ drawerLabel: 'No Access' }}>
                {() => (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, color: '#5b7773' }}>You do not have access to any modules.</Text>
                  </View>
                )}
              </Drawer.Screen>
            )}
          </>
        )}
      </Drawer.Navigator>

    </>
  );
}

const drawerStyles = StyleSheet.create({
  profileCard: { backgroundColor: '#083d3a', margin: 12, borderRadius: 18, padding: 16, gap: 12, elevation: 4, boxShadow: '0px 18px 36px rgba(8, 61, 58, 0.22)' as any },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: { width: 82, height: 44, borderRadius: 12, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8 },
  logoImage: { width: 68, height: 28 },
  companyName: { color: '#ffffff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  companyTagline: { color: '#7a9692', fontSize: 11, fontWeight: '500' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#00877f', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' },
  avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  userName: { color: '#ffffff', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  roleBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  navContainer: { paddingHorizontal: 8, paddingTop: 12, gap: 2 },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#7a9692', letterSpacing: 1.5, paddingHorizontal: 16, paddingVertical: 8, opacity: 0.8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 13, gap: 12, position: 'relative', marginBottom: 3 },
  menuItemActive: { backgroundColor: '#e8f8f6' },
  menuIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuIconBoxActive: { backgroundColor: '#d9f3f0', borderWidth: 1, borderColor: '#a9e4df' },
  menuIconBoxInactive: { backgroundColor: '#f7fbfa' },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#5b7773' },
  menuLabelActive: { color: '#00877f', fontWeight: '700' },
  activeIndicator: { width: 4, height: 18, borderRadius: 2, backgroundColor: '#00877f', position: 'absolute', right: 0 },
  versionText: { fontSize: 11, color: '#7a9692', textAlign: 'center', marginTop: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', marginRight: 16, gap: 12 },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#00877f', alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  headerUserInfo: { alignItems: 'flex-end', gap: 1 },
  headerUserName: { fontSize: 13, fontWeight: '700', color: '#083d3a' },
  headerUserRole: { fontSize: 10, color: '#5b7773', fontWeight: '500', textTransform: 'capitalize' },
});

const dropdownStyles = StyleSheet.create({
  dropdown: { position: 'absolute', top: 45, right: 0, backgroundColor: '#ffffff', borderRadius: 12, width: 200, padding: 8, elevation: 5, borderWidth: 1, borderColor: '#d7e6e4' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8 },
  itemText: { fontSize: 13, fontWeight: '600', color: '#486966' },
  divider: { height: 1, backgroundColor: '#edf5f4', marginVertical: 4 },
});

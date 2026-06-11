import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { DataStorage, fmtDate } from '../utils/storage';
import { PageHeader, DataTable, Column, FormModal, FormField, inputStyle } from '../components';
import { useToast, useConfirm } from '../context';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-z][a-z0-9]{2,39}$/;

export function ClientsScreen() {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const [clients, setClients] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({
    tenantName: '',
    domain: '',
    adminEmail: '',
    adminPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  // Details view state
  const [showDetails, setShowDetails] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientMachines, setClientMachines] = useState<any[]>([]);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const resp = await DataStorage.getTenants();
      const list = Array.isArray(resp) ? resp : resp ? [resp] : [];
      setClients(list);
    } catch (e) {
      console.error(e);
      setClients([]);
    }
  };

  const handleSave = async () => {
    const tenantName = String(formData.tenantName || '').trim();
    const domain = String(formData.domain || '').trim().toLowerCase();
    const adminEmail = String(formData.adminEmail || '').trim().toLowerCase();
    const adminPassword = String(formData.adminPassword || '');

    if (!tenantName || !domain || !adminEmail || !adminPassword) {
      showToast({ message: 'Client name, domain, admin email and password are required.', type: 'warning' });
      return;
    }

    if (tenantName.length < 2 || tenantName.length > 80) {
      showToast({ message: 'Client company name must be 2 to 80 characters.', type: 'warning' });
      return;
    }

    if (!DOMAIN_RE.test(domain)) {
      showToast({ message: 'Domain must start with a letter and use 3 to 40 lowercase letters/numbers only.', type: 'warning' });
      return;
    }

    if (!EMAIL_RE.test(adminEmail)) {
      showToast({ message: 'Enter a valid client admin email address.', type: 'warning' });
      return;
    }

    if (adminPassword.length < 8 || /\s/.test(adminPassword) || !/[A-Za-z]/.test(adminPassword) || !/\d/.test(adminPassword)) {
      showToast({ message: 'Password must be at least 8 characters and include letters and numbers.', type: 'warning' });
      return;
    }

    const normalizedEditId = String(editId || '');
    const hasDuplicate = clients.some((client) => {
      const clientId = String(client._id || client.id || '');
      if (normalizedEditId && clientId === normalizedEditId) return false;

      return (
        String(client.tenantName || '').trim().toLowerCase() === tenantName.toLowerCase() ||
        String(client.domain || '').trim().toLowerCase() === domain ||
        String(client.adminEmail || '').trim().toLowerCase() === adminEmail
      );
    });

    if (hasDuplicate) {
      showToast({ message: 'Client name, domain or admin email already exists.', type: 'error' });
      return;
    }

    const payload = {
      ...formData,
      tenantName,
      domain,
      adminEmail,
      adminPassword,
    };

    if (editId) {
      await DataStorage.updateTenant(editId, payload);
      showToast({ message: 'Client updated successfully.', type: 'success' });
    } else {
      await DataStorage.createTenant(payload);
      showToast({ message: 'Client provisioned successfully.', type: 'success' });
    }
    setShowModal(false);
    setEditId(null);
    setShowPassword(false);
    setFormData({
      tenantName: '',
      domain: '',
      adminEmail: '',
      adminPassword: ''
    });
    loadClients();
  };

  const handleEdit = (client: any) => {
    setFormData({
      tenantName: client.tenantName,
      domain: client.domain,
      adminEmail: client.adminEmail,
      adminPassword: '' // Require re-entering password or leave blank to keep old (backend logic needed, but for MVP require it)
    });
    setEditId(client._id);
    setShowPassword(false);
    setShowModal(true);
  };

  const handleDelete = (client: any) => {
    showConfirm({
      title: 'Delete Client',
      message: `Are you sure you want to delete client "${client.tenantName}"? This action will deactivate all users.`,
      isDestructive: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const success = await DataStorage.deleteTenant(client._id);
        if (success) {
          showToast({ message: 'Client deleted successfully.', type: 'success' });
          loadClients();
        } else {
          showToast({ message: 'Failed to delete client.', type: 'error' });
        }
      }
    });
  };

  const handleViewMachines = async (client: any) => {
    setSelectedClient(client);
    setShowDetails(true);
    try {
      const machines = await DataStorage.getTenantMachines(client._id);
      setClientMachines(machines);
    } catch (e) {
      setClientMachines([]);
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'actions',
      header: 'Actions',
      width: 240,
      render: (t) => (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {/* <TouchableOpacity
            style={styles.viewBtn}
            onPress={() => handleViewMachines(t)}
          >
            <Text style={styles.viewBtnText}>Machines</Text>
          </TouchableOpacity> */}
          <TouchableOpacity
            style={[styles.viewBtn, { backgroundColor: '#eab308' }]}
            onPress={() => handleEdit(t)}
          >
            <Text style={styles.viewBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewBtn, { backgroundColor: '#ef4444' }]}
            onPress={() => handleDelete(t)}
          >
            <Text style={styles.viewBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )
    },
    { key: 'tenantName', header: 'Client / Tenant Name', minWidth: 150 },
    { key: 'domain', header: 'Access Domain', minWidth: 120 },
    { key: 'adminEmail', header: 'Admin Account (Email)', minWidth: 200 },
    {
      key: 'createdAt',
      header: 'Deployed On',
      width: 150,
      render: (t) => <Text style={{ fontSize: 13, color: '#5b7773' }}>{fmtDate(t.createdAt)}</Text>
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.maxWidth}>
        <PageHeader
          title="Client Management System"
          subtitle="Provision isolated environments with central management"
          actionLabel="+ Provision New Client"
          onAction={() => {
            setEditId(null);
            setFormData({ tenantName: '', domain: '', adminEmail: '', adminPassword: '' });
            setShowPassword(false);
            setShowModal(true);
          }}
        />

        <View style={styles.statBox}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#1e3a8a' }}>{clients.length}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#00877f' }}>Active Deployed Tenants</Text>
        </View>

        <DataTable
          data={clients}
          columns={columns}
          keyExtractor={(c) => String(c._id || c.id || c.tenantName || c.domain)}
          emptyMessage="No clients provisioned. Create your first client network."
        />
        <FormModal
          visible={showModal}
          title={editId ? "Edit Client" : "Provision New Client"}
          subtitle={editId ? "Update existing client configuration" : "Generates an isolated database tenant and default Client Admin"}
          onClose={() => { setShowModal(false); setEditId(null); }}
          onSave={handleSave}
          saveLabel={editId ? "Save Changes" : "Deploy Client"}
        >
          <FormField label="Client Company Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. GK Manufacturing Ltd."
              value={formData.tenantName}
              onChangeText={(t) => setFormData({ ...formData, tenantName: t })}
              maxLength={80}
            />
          </FormField>

          <FormField label="Application Domain" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. gkmfg"
              value={formData.domain}
              onChangeText={(t) => setFormData({ ...formData, domain: t.toLowerCase().replace(/[^a-z0-9]/g, '') })}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
            />
            <Text style={styles.helperText}>3-40 lowercase letters/numbers, starts with a letter.</Text>
          </FormField>
          <FormField label="Client Admin Email" required>
            <TextInput
              style={inputStyle.input}
              placeholder="admin@gk.com"
              value={formData.adminEmail}
              onChangeText={(t) => setFormData({ ...formData, adminEmail: t.toLowerCase() })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </FormField>
          <FormField label="Assign Admin Password" required>
            <View style={styles.passwordField}>
              <TextInput
                style={[inputStyle.input, styles.passwordInput]}
                placeholder="Set a secure initial password..."
                value={formData.adminPassword}
                onChangeText={(t) => setFormData({ ...formData, adminPassword: t })}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword((visible) => !visible)}
                activeOpacity={0.8}
              >
                <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>Minimum 8 characters with letters and numbers.</Text>
          </FormField>
        </FormModal>

        {/* Machine Details Modal */}
        <FormModal
          visible={showDetails}
          title={`Provisioned Units: ${selectedClient?.tenantName || ''}`}
          subtitle="Detailed configuration of industrial assets for this tenant"
          onClose={() => setShowDetails(false)}
          onSave={() => setShowDetails(false)}
          saveLabel="Close"
        >
          {clientMachines.length === 0 ? (
            <Text style={styles.emptyText}>No machines provisioned for this client.</Text>
          ) : (
            <View style={styles.machineList}>
              <View style={styles.machineHeader}>
                <Text style={styles.machineHeaderLabel}>Unit ID</Text>
                <Text style={styles.machineHeaderLabel}>Type</Text>
                <Text style={styles.machineHeaderLabel}>Status</Text>
              </View>
              {clientMachines.map((m, idx) => (
                <View key={m._id || idx} style={styles.machineRow}>
                  <Text style={styles.machineId}>{m.machineId}</Text>
                  <View style={[styles.typeBadge, m.type === 'DIE_CASTING' ? styles.typeDC : styles.typeMAC]}>
                    <Text style={styles.typeText}>{m.type.replace('_', ' ')}</Text>
                  </View>
                  <Text style={styles.statusText}>● {m.status}</Text>
                </View>
              ))}
            </View>
          )}
        </FormModal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf5f4' },
  maxWidth: { width: '100%', alignSelf: 'center' },
  statBox: {
    backgroundColor: '#e8f8f6', borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe'
  },
  viewBtn: {
    backgroundColor: '#00877f',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  viewBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  emptyText: {
    textAlign: 'center',
    color: '#5b7773',
    padding: 20,
    fontStyle: 'italic'
  },
  passwordField: {
    position: 'relative',
    justifyContent: 'center'
  },
  passwordInput: {
    paddingRight: 74
  },
  passwordToggle: {
    position: 'absolute',
    right: 8,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e8f8f6',
    borderWidth: 1,
    borderColor: '#a9e4df',
    alignItems: 'center',
    justifyContent: 'center'
  },
  passwordToggleText: {
    color: '#00877f',
    fontSize: 12,
    fontWeight: '800'
  },
  helperText: {
    color: '#5b7773',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6
  },
  machineList: {
    backgroundColor: '#f7fbfa',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d7e6e4'
  },
  machineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#c8dbd8',
    marginBottom: 8
  },
  machineHeaderLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#486966',
    flex: 1
  },
  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4'
  },
  machineId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#183f3c',
    flex: 1
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 10
  },
  typeDC: { backgroundColor: '#dcfce7' },
  typeMAC: { backgroundColor: '#fef9c3' },
  typeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#315451'
  },
  statusText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
    flex: 0.5,
    textAlign: 'right'
  },
  machineSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#d7e6e4'
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#486966',
    marginBottom: 10
  },
  dynamicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  removeRowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  removeRowText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '800'
  },
  addUnitBtn: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e8f8f6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9f3f0',
    borderStyle: 'dashed'
  },
  addUnitBtnText: {
    fontSize: 12,
    color: '#00877f',
    fontWeight: '700'
  }
});

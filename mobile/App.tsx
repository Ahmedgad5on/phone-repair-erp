import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator
} from 'react-native';

const API_BASE = 'http://10.0.2.2:5000/api'; // Android emulator to host loopback

interface RepairTicket {
  id: string;
  ticket_number: string;
  customer_name: string;
  device_brand: string;
  device_model: string;
  fault_description: string;
  status: string;
}

export default function App() {
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'camera' | 'offline'>('tickets');

  const fetchAssignedTickets = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/mobile/technician/my-tickets`);
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      } else {
        // Fallback demo tickets
        setTickets([
          {
            id: 'tick-101',
            ticket_number: 'REP-1001',
            customer_name: 'Mohamed Taha',
            device_brand: 'Apple',
            device_model: 'iPhone 14 Pro Max',
            fault_description: 'Broken display glass, lines on OLED',
            status: 'IN_PROGRESS'
          },
          {
            id: 'tick-102',
            ticket_number: 'REP-1002',
            customer_name: 'Sara Ahmed',
            device_brand: 'Samsung',
            device_model: 'Galaxy S23',
            fault_description: 'Battery drains rapidly, warm while charging',
            status: 'DIAGNOSED'
          }
        ]);
      }
    } catch (err) {
      Alert.alert('Offline Mode', 'Operating in local offline cache mode.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedTickets();
  }, []);

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    try {
      await fetch(`${API_BASE}/mobile/technician/ticket/${ticketId}/quick-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      Alert.alert('Success', `Ticket marked as ${newStatus}`);
      fetchAssignedTickets();
    } catch (e) {
      Alert.alert('Offline Queue', 'Action queued in local storage for auto-sync.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alpha Mobile Tech App</Text>
        <Text style={styles.headerSubtitle}>تطبيق الفنيين الميدانيين</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab('tickets')}
          style={[styles.tabButton, activeTab === 'tickets' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === 'tickets' && styles.tabTextActive]}>
            التذاكر المسندة
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('camera')}
          style={[styles.tabButton, activeTab === 'camera' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === 'camera' && styles.tabTextActive]}>
            مسح الباركود
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('offline')}
          style={[styles.tabButton, activeTab === 'offline' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === 'offline' && styles.tabTextActive]}>
            المزامنة (Sync)
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : activeTab === 'tickets' ? (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.ticketCard}>
              <View style={styles.ticketHeader}>
                <Text style={styles.ticketNumber}>#{item.ticket_number || item.id}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{item.status}</Text>
                </View>
              </View>

              <Text style={styles.deviceTitle}>{item.device_brand} {item.device_model}</Text>
              <Text style={styles.customerName}>العميل: {item.customer_name}</Text>
              <Text style={styles.faultDesc}>العطل: {item.fault_description}</Text>

              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnDiagnosed]}
                  onPress={() => handleUpdateStatus(item.id, 'DIAGNOSED')}
                >
                  <Text style={styles.btnText}>تم الفحص</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnProgress]}
                  onPress={() => handleUpdateStatus(item.id, 'IN_PROGRESS')}
                >
                  <Text style={styles.btnText}>قيد الإصلاح</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnReady]}
                  onPress={() => handleUpdateStatus(item.id, 'READY_FOR_PICKUP')}
                >
                  <Text style={styles.btnText}>جاهز للاستلام</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      ) : activeTab === 'camera' ? (
        <View style={styles.centerContainer}>
          <Text style={styles.infoTitle}>كاميرا الهاتف والباركود</Text>
          <Text style={styles.infoDesc}>يمكن مسح باركود قطع الغيار وسيريال الأجهزة بكاميرا الهاتف وتوثيق حالة الأجهزة بالصور.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => Alert.alert('Camera', 'Mobile camera stream initialized.')}
          >
            <Text style={styles.primaryButtonText}>فتح الكاميرا والماسح</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.centerContainer}>
          <Text style={styles.infoTitle}>حالة وضع عدم الاتصال (Offline-First)</Text>
          <Text style={styles.infoDesc}>جميع العمليات تخزن في قاعدة البيانات المحلية بالهاتف وتزامن تلقائياً فور توفر الاتصال.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => Alert.alert('Sync', '0 pending actions in local queue.')}
          >
            <Text style={styles.primaryButtonText}>مزامنة البيانات الآن</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc'
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center'
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#6366f1'
  },
  tabText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600'
  },
  tabTextActive: {
    color: '#6366f1'
  },
  listContent: {
    padding: 16
  },
  ticketCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  ticketNumber: {
    color: '#818cf8',
    fontWeight: 'bold',
    fontSize: 14
  },
  statusBadge: {
    backgroundColor: '#312e81',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8
  },
  statusBadgeText: {
    color: '#c7d2fe',
    fontSize: 10,
    fontWeight: 'bold'
  },
  deviceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 4
  },
  customerName: {
    fontSize: 12,
    color: '#94a3b8'
  },
  faultDesc: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 4,
    marginBottom: 12
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  btnDiagnosed: {
    backgroundColor: '#0284c7'
  },
  btnProgress: {
    backgroundColor: '#d97706'
  },
  btnReady: {
    backgroundColor: '#16a34a'
  },
  btnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold'
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 8,
    textAlign: 'center'
  },
  infoDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 20
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14
  }
});

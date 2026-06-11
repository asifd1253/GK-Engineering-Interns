import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // Future integration points for external providers
  private readonly SMTP_CONFIG = { host: 'smtp.example.com', port: 587 };
  private readonly WHATSAPP_API = { url: 'https://api.whatsapp.com/v1/messages' };

  /**
   * Send WhatsApp Alert regarding downtime or high rejections.
   */
  async sendWhatsAppAlert(toNumbers: string[], message: string): Promise<boolean> {
    try {
      this.logger.log(`[WhatsApp Stub] Sending to ${toNumbers.join(', ')}: ${message}`);
      // TODO: Implement external API logic here
      // const res = await axios.post(this.WHATSAPP_API.url, { to: toNumbers, text: message });
      return true;
    } catch (e) {
      this.logger.error(`Failed to send WhatsApp Alert`, e);
      return false;
    }
  }

  /**
   * Send Email Alert regarding downtime or high rejections.
   */
  async sendEmailAlert(toEmails: string[], subject: string, message: string): Promise<boolean> {
    try {
      this.logger.log(`[Email Stub] Sending to ${toEmails.join(', ')}: [${subject}] - ${message}`);
      // TODO: Implement SMTP/Nodemailer logic here
      return true;
    } catch (e) {
      this.logger.error(`Failed to send Email Alert`, e);
      return false;
    }
  }

  /**
   * Universal Escalation Trigger to call from business logic (Production/Work Order)
   */
  async triggerEscalation(event: 'DOWNTIME' | 'HIGH_REJECTION', details: Record<string, any>) {
    // Determine audience based on Config (Admins and PDC Managers)
    const adminEmails = ['admin@example.com'];
    const adminPhones = ['+1234567890'];

    let message = '';
    let subject = '';

    if (event === 'DOWNTIME') {
      subject = `DOWNTIME ALERT: Machine ${details.machineId}`;
      message = `Machine ${details.machineId} reported downtime.\nReason: ${details.reason}\nReported by: ${details.user}`;
    } else if (event === 'HIGH_REJECTION') {
      subject = `QUALITY ALERT: High Rejections on WO-${details.workOrderId}`;
      message = `Work Order ${details.workOrderId} has high rejection rate.\nProcess: ${details.process}\nRejected Qty: ${details.rejectedPartsCount}\nReasons: ${details.reasons.join(', ')}`;
    }

    if (message) {
      await Promise.all([
        this.sendEmailAlert(adminEmails, subject, message),
        this.sendWhatsAppAlert(adminPhones, `*${subject}*\n${message}`)
      ]);
    }
  }

  async getNotifications(): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    
    // Generate static dummy data for today's date until 5:50 PM
    return [
      {
        id: 'n1',
        type: 'IDLE_ALERT',
        title: 'Machine DC-001 Idle',
        message: 'Machine DC-001 has been idle for 12 minutes (Threshold: 5 min).',
        timestamp: `${today}T10:15:00Z`,
        data: { machineId: 'DC-001', idleTime: 12 },
        read: false
      },
      {
        id: 'n2',
        type: 'IDLE_ALERT',
        title: 'Machine M-005 Idle',
        message: 'Machine M-005 has been idle for 25 minutes (Threshold: 5 min).',
        timestamp: `${today}T14:30:00Z`,
        data: { machineId: 'M-005', idleTime: 25 },
        read: true
      },
      {
        id: 'n3',
        type: 'IDLE_ALERT',
        title: 'Machine C-002 Idle',
        message: 'Machine C-002 has been idle for 8 minutes (Threshold: 5 min).',
        timestamp: `${today}T17:45:00Z`, // 5:45 PM
        data: { machineId: 'C-002', idleTime: 8 },
        read: false
      }
    ];
  }
}

const pool = require('../config/database');

class CrmActivityRepository {
  async findActivitiesByLeadId(leadId, connection = null) {
    const db = connection || pool;
    const query = `
      SELECT 
        a.id,
        a.lead_id,
        a.institution_id,
        a.activity_type,
        a.subject,
        a.description,
        a.contact_method,
        a.template_id,
        a.message_content,
        a.message_status,
        a.provider_message_id,
        a.created_by_user_id,
        a.created_at,
        u.name AS created_by_name,
        u.username AS created_by_username,
        t.name AS template_name,
        t.event_key AS template_event_key
      FROM crm_lead_activities a
      LEFT JOIN users u ON a.created_by_user_id = u.id
      LEFT JOIN crm_wa_templates t ON a.template_id = t.id
      WHERE a.lead_id = ?
      ORDER BY a.created_at DESC, a.id DESC
    `;

    const [rows] = await db.query(query, [leadId]);
    return rows;
  }

  async findActivityById(id, connection = null) {
    const db = connection || pool;
    const query = `
      SELECT 
        a.id,
        a.lead_id,
        a.institution_id,
        a.activity_type,
        a.subject,
        a.description,
        a.contact_method,
        a.template_id,
        a.message_content,
        a.message_status,
        a.provider_message_id,
        a.created_by_user_id,
        a.created_at,
        u.name AS created_by_name,
        u.username AS created_by_username,
        t.name AS template_name
      FROM crm_lead_activities a
      LEFT JOIN users u ON a.created_by_user_id = u.id
      LEFT JOIN crm_wa_templates t ON a.template_id = t.id
      WHERE a.id = ?
    `;

    const [rows] = await db.query(query, [id]);
    return rows[0] || null;
  }

  async createActivity(data, connection = null) {
    const db = connection || pool;
    const query = `
      INSERT INTO crm_lead_activities (
        lead_id,
        institution_id,
        activity_type,
        subject,
        description,
        contact_method,
        template_id,
        message_content,
        message_status,
        provider_message_id,
        created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      data.lead_id,
      data.institution_id,
      data.activity_type,
      data.subject || null,
      data.description || null,
      data.contact_method || null,
      data.template_id || null,
      data.message_content || null,
      data.message_status || null,
      data.provider_message_id || null,
      data.created_by_user_id || null
    ];

    const [result] = await db.query(query, values);
    return result.insertId;
  }

  async updateLeadSchedule(leadId, nextFollowUpAt, connection = null) {
    const db = connection || pool;
    const query = `
      UPDATE crm_leads 
      SET next_follow_up_at = ?
      WHERE id = ?
    `;
    const [result] = await db.query(query, [nextFollowUpAt, leadId]);
    return result.affectedRows;
  }

  async updateLeadLastContacted(leadId, timestamp = new Date(), connection = null) {
    const db = connection || pool;
    const query = `
      UPDATE crm_leads 
      SET last_contacted_at = ?
      WHERE id = ?
    `;
    const [result] = await db.query(query, [timestamp, leadId]);
    return result.affectedRows;
  }
}

module.exports = new CrmActivityRepository();

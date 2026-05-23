-- Allow same-org users to write notifications to each other.
-- Reads/updates/deletes still gated to the recipient. This unlocks
-- staff-triggered events (project status moved, invoice submitted)
-- creating notifications for the owner — without giving anyone the
-- ability to read another user's notifications.

DROP POLICY IF EXISTS "users_own_notifications" ON notifications;

CREATE POLICY "read_own_notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "update_own_notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "delete_own_notifications" ON notifications
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "insert_same_org_notifications" ON notifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_profiles up_caller
      JOIN user_profiles up_recipient ON up_caller.org_id = up_recipient.org_id
      WHERE up_caller.id = auth.uid()
        AND up_recipient.id = notifications.user_id
    )
  );

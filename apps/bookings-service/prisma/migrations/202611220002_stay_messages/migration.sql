CREATE TABLE stay_messages (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  sender_role text NOT NULL CHECK (sender_role IN ('OWNER','GUEST')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stay_messages_thread ON stay_messages (booking_id, sent_at, id);

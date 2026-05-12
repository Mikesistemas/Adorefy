from . import db
import json
from datetime import datetime

class Notification(db.Model):
    __tablename__ = 'notifications'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(50))  # unavailability_request, scale_invite, etc.
    data = db.Column(db.Text, default='{}')  # JSON data
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def get_data(self):
        try:
            return json.loads(self.data)
        except:
            return {}
    
    def set_data(self, data_dict):
        self.data = json.dumps(data_dict)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'data': self.get_data(),
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat()
        }
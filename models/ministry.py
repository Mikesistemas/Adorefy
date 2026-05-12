from . import db
import json
from datetime import datetime

class Ministry(db.Model):
    __tablename__ = 'ministries'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    leader_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    members = db.Column(db.Text, default='[]')  # JSON array of member IDs
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    scales = db.relationship('Scale', backref='ministry', lazy=True)
    
    def get_members(self):
        try:
            return json.loads(self.members)
        except:
            return []
    
    def set_members(self, members_list):
        self.members = json.dumps(members_list)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'leader': self.leader_id,
            'members': self.get_members(),
            'created_at': self.created_at.isoformat()
        }

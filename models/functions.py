from . import db
from .unavailability import UnavailabilityRequest
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token
import json
from datetime import datetime

class MemberFunction(db.Model):
    __tablename__ = 'member_functions'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)  # Ex: "Vocal", "Violão", "Baixo"
    description = db.Column(db.Text)
    ministry_id = db.Column(db.Integer, db.ForeignKey('ministries.id'), nullable=False)
    leader_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    color = db.Column(db.String(20), default='#9147ff')  # Cor para identificar a função
    order = db.Column(db.Integer, default=0)  # Ordem de exibição
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relacionamentos
    ministry = db.relationship('Ministry', backref=db.backref('functions', lazy=True))
    leader = db.relationship('User', backref=db.backref('created_functions', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'ministry_id': self.ministry_id,
            'leader_id': self.leader_id,
            'color': self.color,
            'order': self.order,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'ministry_name': self.ministry.name if self.ministry else None,
            'leader_name': self.leader.name if self.leader else None
        }           

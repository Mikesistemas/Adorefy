from . import db
from .unavailability import UnavailabilityRequest
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token
import json
from datetime import datetime

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)

    # Pedidos feitos pelo próprio usuário
    unavailability_requests = db.relationship(
        'UnavailabilityRequest',
        foreign_keys='UnavailabilityRequest.user_id',
        backref='requester',
        lazy=True
    )

    # Pedidos que este usuário revisou
    reviewed_unavailability = db.relationship(
        'UnavailabilityRequest',
        foreign_keys='UnavailabilityRequest.reviewed_by',
        backref='reviewer',
        lazy=True
    )
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(20))
    role = db.Column(db.String(20), default='membro')
    skills = db.Column(db.Text, default='[]')
    ministries = db.Column(db.Text, default='[]')
    permissions = db.Column(db.Text, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    scales_created = db.relationship('Scale', backref='creator', lazy=True)

    unavailability_requests = db.relationship(
        'UnavailabilityRequest',
        foreign_keys=[UnavailabilityRequest.user_id],
        backref='requester',
        lazy=True
    )

    reviewed_unavailability = db.relationship(
        'UnavailabilityRequest',
        foreign_keys=[UnavailabilityRequest.reviewed_by],
        backref='reviewer',
        lazy=True
    )

    notifications = db.relationship('Notification', backref='user', lazy=True)
    
   # ✅ CORRETO: JSON object, não array
    permitted_ministries = db.Column(db.Text, default='{}')  # JSON object {permission: [ministry_ids]}
    
    def get_permitted_ministries(self):
        """Retorna dicionário de permissão -> lista de ministérios"""
        import json
        try:
            return json.loads(self.permitted_ministries) if self.permitted_ministries else {}
        except:
            return {}
    
    def set_permitted_ministries(self, data):
        """Armazena quais ministérios cada permissão se aplica"""
        import json
        self.permitted_ministries = json.dumps(data)
            
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def create_access_token(self):
        return create_access_token(identity=self.id)
    
    def get_skills(self):
        try:
            return json.loads(self.skills)
        except:
            return []
    
    def set_skills(self, skills_list):
        self.skills = json.dumps(skills_list)
    
    def get_ministries(self):
        try:
            return json.loads(self.ministries)
        except:
            return []
    
    def set_ministries(self, ministries_list):
        self.ministries = json.dumps(ministries_list)
    
    def get_permissions(self):
        try:
            return json.loads(self.permissions)
        except:
            return []
    
    def set_permissions(self, permissions_list):
        self.permissions = json.dumps(permissions_list)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'role': self.role,
            'skills': self.get_skills(),
            'ministries': self.get_ministries(),
            'permissions': self.get_permissions(),
            'created_at': self.created_at.isoformat(),
            'is_active': self.is_active,
            'notifications': [n.to_dict() for n in self.notifications if not n.is_read],
            'unavailability': [u.to_dict() for u in self.unavailability_requests]
        }
    
    def to_simple_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'skills': self.get_skills()
        }
        
    @property
    def led_ministries(self):
        """Ministérios que este usuário lidera"""
        from .ministry import Ministry
        
        if self.role == 'admin':
            return Ministry.query.all()
        elif self.role == 'lider':
            return Ministry.query.filter_by(leader_id=self.id).all()
        else:
            return []    
            


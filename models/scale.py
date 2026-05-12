from . import db
import json
from datetime import datetime

class Scale(db.Model):
    __tablename__ = 'scales'
    
    id = db.Column(db.Integer, primary_key=True)
    event = db.Column(db.String(200), nullable=False)
    date = db.Column(db.Date, nullable=False)
    time = db.Column(db.String(10), nullable=False)
    ministry_id = db.Column(db.Integer, db.ForeignKey('ministries.id'), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')  # pending, confirmed, cancelled
    members = db.Column(db.Text, default='[]')  # JSON array of {id, role, status}
    songs = db.Column(db.Text, default='[]')  # JSON array of song IDs
    observations = db.Column(db.Text, default='[]')  # JSON array of observations
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # CAMPOS PARA ESCALAS MENSAL
    scale_type = db.Column(db.String(50), default='single')  # 'single' ou 'monthly_group'
    scale_group = db.Column(db.String(100))  # UUID para agrupar escalas mensais
    month_reference = db.Column(db.String(7))  # Formato: YYYY-MM
    
    # CAMPOS ADICIONAIS PARA MÚSICA
    music_key = db.Column(db.String(10))
    send_lyrics = db.Column(db.Boolean, default=True)

    
    def get_members(self):
        """Retorna membros como lista Python"""
        try:
            if self.members:
                return json.loads(self.members)
            return []
        except (json.JSONDecodeError, TypeError) as e:
            print(f"❌ Erro ao carregar membros da escala {self.id}: {e}")
            return []
    
    def set_members(self, members_list):
        """Armazena membros como JSON string"""
        if isinstance(members_list, list):
            self.members = json.dumps(members_list, ensure_ascii=False)
        else:
            self.members = '[]'
            print(f"⚠️ set_members recebeu tipo inválido: {type(members_list)}")
    
    def get_songs(self):
        """Retorna músicas como lista Python"""
        try:
            if self.songs:
                return json.loads(self.songs)
            return []
        except (json.JSONDecodeError, TypeError) as e:
            print(f"❌ Erro ao carregar músicas da escala {self.id}: {e}")
            return []
    
    def set_songs(self, songs_list):
        """Armazena músicas como JSON string"""
        if isinstance(songs_list, list):
            self.songs = json.dumps(songs_list, ensure_ascii=False)
        else:
            self.songs = '[]'
    
    def get_observations(self):
        """Retorna observações como lista Python"""
        try:
            if self.observations:
                return json.loads(self.observations)
            return []
        except (json.JSONDecodeError, TypeError) as e:
            print(f"❌ Erro ao carregar observações da escala {self.id}: {e}")
            return []
    
    def set_observations(self, observations_list):
        """Armazena observações como JSON string"""
        if isinstance(observations_list, list):
            self.observations = json.dumps(observations_list, ensure_ascii=False)
        else:
            self.observations = '[]'
    
    def to_dict(self):
        """Converte o objeto para dicionário com todos os campos"""
        try:
            data = {
                'id': self.id,
                'event': self.event,
                'date': self.date.isoformat() if self.date else None,
                'time': self.time,
                'ministry': self.ministry_id,  # Mantido para compatibilidade
                'ministry_id': self.ministry_id,  # Adicionado
                'description': self.description,
                'status': self.status,
                'members': self.get_members(),
                'songs': self.get_songs(),
                'observations': self.get_observations(),
                'createdBy': self.created_by,
                'created_by': self.created_by,
                'created_at': self.created_at.isoformat() if self.created_at else None,
                'updated_at': self.updated_at.isoformat() if self.updated_at else None,
                
                # Campos para escalas mensais
                'scale_type': self.scale_type,
                'scale_group': self.scale_group,
                'month_reference': self.month_reference,
                
                # Campos adicionais para música
                'music_key': self.music_key,
                'send_lyrics': self.send_lyrics if self.send_lyrics is not None else True,
                
                # Informações relacionadas
                'ministry_name': self.ministry.name if self.ministry else None,
                'created_by_name': self.creator.name if self.creator else None
            }
            
            return data
            
        except Exception as e:
            print(f"❌ Erro em Scale.to_dict() para escala {self.id}: {e}")
            
            # Retornar dados mínimos em caso de erro
            return {
                'id': self.id,
                'event': self.event or 'Evento desconhecido',
                'date': self.date.isoformat() if self.date else None,
                'time': self.time or '',
                'ministry_id': self.ministry_id,
                'status': self.status or 'pending'
            }
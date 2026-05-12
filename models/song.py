from models import db
from sqlalchemy import Text
from datetime import datetime
import json

class Song(db.Model):
    __tablename__ = 'songs'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(200), nullable=False)
    youtube_id = db.Column(db.String(100))
    duration = db.Column(db.String(20))
    lyrics = db.Column(db.Text)  # Campo para letra da música
    chords = db.Column(db.Text)   # Campo para cifra da música
    tags = db.Column(db.Text, default='[]')  # JSON array
    links = db.Column(db.Text, default='[]')  # JSON array
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __init__(self, title, artist, youtube_id=None, duration=None, lyrics=None, chords=None):
        self.title = title
        self.artist = artist
        self.youtube_id = youtube_id
        self.duration = duration
        self.lyrics = lyrics
        self.chords = chords
        self.tags = '[]'
        self.links = '[]'
    
    def set_tags(self, tags_list):
        if isinstance(tags_list, list):
            self.tags = json.dumps(tags_list)
    
    def get_tags(self):
        try:
            return json.loads(self.tags) if self.tags else []
        except:
            return []
    
    def set_links(self, links_list):
        if isinstance(links_list, list):
            self.links = json.dumps(links_list)
    
    def get_links(self):
        try:
            return json.loads(self.links) if self.links else []
        except:
            return []
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'artist': self.artist,
            'youtubeId': self.youtube_id,
            'duration': self.duration,
            'lyrics': self.lyrics,  # Incluir letra
            'chords': self.chords,   # Incluir cifra
            'tags': self.get_tags(),
            'links': self.get_links(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

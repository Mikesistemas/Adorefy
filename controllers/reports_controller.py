# reports_controller.py
from datetime import datetime, timedelta
from flask import request, jsonify
from models import db, UnavailabilityRequest, User, Ministry, Scale, Song
from sqlalchemy import func, desc, and_
import json

class ReportsController:
    
    def __init__(self):
        pass
    
    def get_dashboard_indicators(self):
        """
        Retorna os principais indicadores para o dashboard
        """
        try:
            print("DEBUG: get_dashboard_indicators chamado")
            print("DEBUG: Args:", dict(request.args))
            
            # Parâmetros de filtro
            start_date = request.args.get('start_date')
            end_date = request.args.get('end_date')
            ministry_id = request.args.get('ministry_id')
            
            # Converter datas se fornecidas
            if start_date:
                start_date = datetime.strptime(start_date, '%Y-%m-%d')
                print(f"DEBUG: start_date: {start_date}")
            if end_date:
                end_date = datetime.strptime(end_date, '%Y-%m-%d')
                print(f"DEBUG: end_date: {end_date}")
            if ministry_id:
                try:
                    ministry_id = int(ministry_id)
                    print(f"DEBUG: ministry_id: {ministry_id}")
                except:
                    ministry_id = None
            
            # 1. Membro com mais indisponibilidades
            member_most_unavailability = self.get_member_most_unavailability(start_date, end_date)
            print(f"DEBUG: member_most_unavailability: {member_most_unavailability}")
            
            # 2. Membro mais escalado
            member_most_scaled = self.get_member_most_scaled(start_date, end_date, ministry_id)
            print(f"DEBUG: member_most_scaled: {member_most_scaled}")
            
            # 3. Membro menos escalado (com pelo menos 1 escala)
            member_least_scaled = self.get_member_least_scaled(start_date, end_date, ministry_id)
            print(f"DEBUG: member_least_scaled: {member_least_scaled}")
            
            # 4. Músicas mais escaladas
            top_songs = self.get_top_songs_data(start_date, end_date, ministry_id, limit=5)
            print(f"DEBUG: top_songs count: {len(top_songs)}")
            
            # 5. Vocalistas mais escalados
            top_vocalists = self.get_top_vocalists(start_date, end_date, ministry_id, limit=5)
            print(f"DEBUG: top_vocalists count: {len(top_vocalists)}")
            
            # 6. Taxa de confirmação de escalas
            scale_confirmation_rate = self.get_scale_confirmation_rate(start_date, end_date, ministry_id)
            print(f"DEBUG: scale_confirmation_rate: {scale_confirmation_rate}")
            
            # 7. Indisponibilidades por status
            unavailability_by_status = self.get_unavailability_by_status(start_date, end_date)
            print(f"DEBUG: unavailability_by_status: {unavailability_by_status}")
            
            # 8. Ministérios mais ativos
            top_ministries = self.get_top_ministries(start_date, end_date, limit=5)
            print(f"DEBUG: top_ministries count: {len(top_ministries)}")
            
            # 9. Crescimento de membros
            member_growth = self.get_member_growth(start_date, end_date)
            print(f"DEBUG: member_growth: {member_growth}")
            
            # 10. Média de escalas por membro
            avg_scales_per_member = self.get_avg_scales_per_member(start_date, end_date, ministry_id)
            print(f"DEBUG: avg_scales_per_member: {avg_scales_per_member}")
            
            return jsonify({
                'success': True,
                'data': {
                    'member_most_unavailability': member_most_unavailability,
                    'member_most_scaled': member_most_scaled,
                    'member_least_scaled': member_least_scaled,
                    'top_songs': top_songs,
                    'top_vocalists': top_vocalists,
                    'scale_confirmation_rate': scale_confirmation_rate,
                    'unavailability_by_status': unavailability_by_status,
                    'top_ministries': top_ministries,
                    'member_growth': member_growth,
                    'avg_scales_per_member': avg_scales_per_member,
                    'summary': {
                        'total_members': User.query.filter_by(is_active=True).count(),
                        'total_scales': self.get_total_scales(start_date, end_date, ministry_id),
                        'total_unavailability': self.get_total_unavailability(start_date, end_date),
                        'total_songs': Song.query.count()
                    }
                }
            })
            
        except Exception as e:
            print(f"DEBUG: Erro em get_dashboard_indicators: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    def get_member_most_unavailability(self, start_date=None, end_date=None):
        """
        Retorna o membro com mais indisponibilidades aprovadas
        """
        try:
            query = db.session.query(
                UnavailabilityRequest.user_id,
                User.name,
                func.count(UnavailabilityRequest.id).label('total')
            ).join(
                User, UnavailabilityRequest.user_id == User.id
            ).filter(
                UnavailabilityRequest.status == 'approved'
            )
            
            if start_date:
                query = query.filter(UnavailabilityRequest.start_date >= start_date)
            if end_date:
                query = query.filter(UnavailabilityRequest.end_date <= end_date)
            
            result = query.group_by(
                UnavailabilityRequest.user_id, User.name
            ).order_by(
                desc('total')
            ).first()
            
            if result:
                return {
                    'user_id': result.user_id,
                    'name': result.name,
                    'total': result.total
                }
            return None
            
        except Exception as e:
            print(f"DEBUG: Erro em get_member_most_unavailability: {str(e)}")
            return None
    
    def get_member_most_scaled(self, start_date=None, end_date=None, ministry_id=None):
        """
        Retorna o membro mais escalado
        """
        try:
            print(f"DEBUG get_member_most_scaled: ministry_id={ministry_id}")
            
            # Primeiro, precisamos obter as escalas
            scale_query = Scale.query
            
            if start_date:
                scale_query = scale_query.filter(Scale.date >= start_date)
            if end_date:
                scale_query = scale_query.filter(Scale.date <= end_date)
            if ministry_id:
                scale_query = scale_query.filter(Scale.ministry_id == ministry_id)
            
            scales = scale_query.all()
            print(f"DEBUG: Encontradas {len(scales)} escalas")
            
            # Contar participação em escalas
            member_count = {}
            for scale in scales:
                if scale.members:
                    members_data = json.loads(scale.members) if isinstance(scale.members, str) else scale.members
                    for member in members_data:
                        member_id = member.get('id') if isinstance(member, dict) else member
                        if member_id:
                            member_count[member_id] = member_count.get(member_id, 0) + 1
            
            print(f"DEBUG: Participação de {len(member_count)} membros")
            
            if not member_count:
                return None
            
            # Encontrar membro com mais escalas
            most_scaled_id = max(member_count, key=member_count.get)
            user = User.query.get(most_scaled_id)
            
            if user:
                result = {
                    'user_id': user.id,
                    'name': user.name,
                    'total': member_count[most_scaled_id]
                }
                print(f"DEBUG: Membro mais escalado: {result}")
                return result
            return None
            
        except Exception as e:
            print(f"DEBUG: Erro em get_member_most_scaled: {str(e)}")
            return None
    
    def get_member_least_scaled(self, start_date=None, end_date=None, ministry_id=None):
        """
        Retorna o membro menos escalado (com pelo menos 1 escala)
        """
        try:
            # Primeiro, precisamos obter as escalas
            scale_query = Scale.query
            
            if start_date:
                scale_query = scale_query.filter(Scale.date >= start_date)
            if end_date:
                scale_query = scale_query.filter(Scale.date <= end_date)
            if ministry_id:
                scale_query = scale_query.filter(Scale.ministry_id == ministry_id)
            
            scales = scale_query.all()
            
            # Contar participação em escalas
            member_count = {}
            for scale in scales:
                if scale.members:
                    members_data = json.loads(scale.members) if isinstance(scale.members, str) else scale.members
                    for member in members_data:
                        member_id = member.get('id') if isinstance(member, dict) else member
                        if member_id:
                            member_count[member_id] = member_count.get(member_id, 0) + 1
            
            if not member_count:
                return None
            
            # Encontrar membro com menos escalas (mas pelo menos 1)
            active_members = {k: v for k, v in member_count.items() if v > 0}
            if not active_members:
                return None
            
            least_scaled_id = min(active_members, key=active_members.get)
            user = User.query.get(least_scaled_id)
            
            if user:
                return {
                    'user_id': user.id,
                    'name': user.name,
                    'total': active_members[least_scaled_id]
                }
            return None
            
        except Exception as e:
            print(f"DEBUG: Erro em get_member_least_scaled: {str(e)}")
            return None
    
    def get_top_songs_data(self, start_date=None, end_date=None, ministry_id=None, limit=5):
        """
        Retorna as músicas mais escaladas
        """
        try:
            scale_query = Scale.query
            
            if start_date:
                scale_query = scale_query.filter(Scale.date >= start_date)
            if end_date:
                scale_query = scale_query.filter(Scale.date <= end_date)
            if ministry_id:
                scale_query = scale_query.filter(Scale.ministry_id == ministry_id)
            
            scales = scale_query.all()
            
            # Contar músicas em escalas
            song_count = {}
            for scale in scales:
                if scale.songs:
                    songs_data = json.loads(scale.songs) if isinstance(scale.songs, str) else scale.songs
                    for song in songs_data:
                        song_id = song.get('id') if isinstance(song, dict) else song
                        if song_id:
                            song_count[song_id] = song_count.get(song_id, 0) + 1
            
            # Ordenar por contagem
            sorted_songs = sorted(song_count.items(), key=lambda x: x[1], reverse=True)[:limit]
            
            result = []
            for song_id, count in sorted_songs:
                song = Song.query.get(song_id)
                if song:
                    result.append({
                        'song_id': song.id,
                        'title': song.title,
                        'artist': song.artist,
                        'total': count
                    })
            
            return result
            
        except Exception as e:
            print(f"DEBUG: Erro em get_top_songs_data: {str(e)}")
            return []
    
    def get_top_vocalists(self, start_date=None, end_date=None, ministry_id=None, limit=5):
        """
        Retorna os vocalistas mais escalados
        """
        try:
            scale_query = Scale.query
            
            if start_date:
                scale_query = scale_query.filter(Scale.date >= start_date)
            if end_date:
                scale_query = scale_query.filter(Scale.date <= end_date)
            if ministry_id:
                scale_query = scale_query.filter(Scale.ministry_id == ministry_id)
            
            scales = scale_query.all()
            
            # Contar vocalistas
            vocalist_count = {}
            for scale in scales:
                if scale.members:
                    members_data = json.loads(scale.members) if isinstance(scale.members, str) else scale.members
                    for member in members_data:
                        if isinstance(member, dict):
                            # Verificar se é vocalista
                            role = member.get('role', '').lower()
                            if 'vocal' in role or 'voz' in role or 'cantor' in role:
                                member_id = member.get('id')
                                if member_id:
                                    vocalist_count[member_id] = vocalist_count.get(member_id, 0) + 1
            
            # Ordenar por contagem
            sorted_vocalists = sorted(vocalist_count.items(), key=lambda x: x[1], reverse=True)[:limit]
            
            result = []
            for member_id, count in sorted_vocalists:
                user = User.query.get(member_id)
                if user:
                    result.append({
                        'user_id': user.id,
                        'name': user.name,
                        'total': count
                    })
            
            return result
            
        except Exception as e:
            print(f"DEBUG: Erro em get_top_vocalists: {str(e)}")
            return []
    
    def get_scale_confirmation_rate(self, start_date=None, end_date=None, ministry_id=None):
        """
        Calcula a taxa de confirmação de escalas
        """
        try:
            query = Scale.query
            
            if start_date:
                query = query.filter(Scale.date >= start_date)
            if end_date:
                query = query.filter(Scale.date <= end_date)
            if ministry_id:
                query = query.filter(Scale.ministry_id == ministry_id)
            
            total_scales = query.count()
            confirmed_scales = query.filter_by(status='confirmed').count()
            
            if total_scales == 0:
                return 0
            
            return round((confirmed_scales / total_scales) * 100, 2)
            
        except Exception as e:
            print(f"DEBUG: Erro em get_scale_confirmation_rate: {str(e)}")
            return 0
    
    def get_unavailability_by_status(self, start_date=None, end_date=None):
        """
        Retorna contagem de indisponibilidades por status
        """
        try:
            query = UnavailabilityRequest.query
            
            if start_date:
                query = query.filter(UnavailabilityRequest.start_date >= start_date)
            if end_date:
                query = query.filter(UnavailabilityRequest.end_date <= end_date)
            
            result = query.with_entities(
                UnavailabilityRequest.status,
                func.count(UnavailabilityRequest.id).label('count')
            ).group_by(
                UnavailabilityRequest.status
            ).all()
            
            return {status: count for status, count in result}
            
        except Exception as e:
            print(f"DEBUG: Erro em get_unavailability_by_status: {str(e)}")
            return {}
    
    def get_top_ministries(self, start_date=None, end_date=None, limit=5):
        """
        Retorna os ministérios mais ativos (com mais escalas)
        """
        try:
            query = db.session.query(
                Scale.ministry_id,
                Ministry.name,
                func.count(Scale.id).label('total_scales')
            ).join(
                Ministry, Scale.ministry_id == Ministry.id
            )
            
            if start_date:
                query = query.filter(Scale.date >= start_date)
            if end_date:
                query = query.filter(Scale.date <= end_date)
            
            result = query.group_by(
                Scale.ministry_id, Ministry.name
            ).order_by(
                desc('total_scales')
            ).limit(limit).all()
            
            return [{
                'ministry_id': ministry_id,
                'name': name,
                'total_scales': total_scales
            } for ministry_id, name, total_scales in result]
            
        except Exception as e:
            print(f"DEBUG: Erro em get_top_ministries: {str(e)}")
            return []
    
    def get_member_growth(self, start_date=None, end_date=None):
        """
        Calcula o crescimento de membros no período
        """
        try:
            if not start_date or not end_date:
                # Usar últimos 6 meses como padrão
                end_date = datetime.now()
                start_date = end_date - timedelta(days=180)
            
            # Membros ativos no início do período
            initial_count = User.query.filter(
                User.created_at <= start_date,
                User.is_active == True
            ).count()
            
            # Membros ativos no final do período
            final_count = User.query.filter(
                User.created_at <= end_date,
                User.is_active == True
            ).count()
            
            # Novos membros no período
            new_members = User.query.filter(
                User.created_at.between(start_date, end_date),
                User.is_active == True
            ).count()
            
            if initial_count == 0:
                growth_rate = 100 if final_count > 0 else 0
            else:
                growth_rate = round(((final_count - initial_count) / initial_count) * 100, 2)
            
            return {
                'initial_count': initial_count,
                'final_count': final_count,
                'new_members': new_members,
                'growth_rate': growth_rate
            }
            
        except Exception as e:
            print(f"DEBUG: Erro em get_member_growth: {str(e)}")
            return {
                'initial_count': 0,
                'final_count': 0,
                'new_members': 0,
                'growth_rate': 0
            }
    
    def get_avg_scales_per_member(self, start_date=None, end_date=None, ministry_id=None):
        """
        Calcula a média de escalas por membro ativo
        """
        try:
            # Obter escalas no período
            scale_query = Scale.query
            
            if start_date:
                scale_query = scale_query.filter(Scale.date >= start_date)
            if end_date:
                scale_query = scale_query.filter(Scale.date <= end_date)
            if ministry_id:
                scale_query = scale_query.filter(Scale.ministry_id == ministry_id)
            
            scales = scale_query.all()
            
            # Contar participação única de membros
            unique_members = set()
            for scale in scales:
                if scale.members:
                    members_data = json.loads(scale.members) if isinstance(scale.members, str) else scale.members
                    for member in members_data:
                        member_id = member.get('id') if isinstance(member, dict) else member
                        if member_id:
                            unique_members.add(member_id)
            
            total_members = len(unique_members)
            total_scales = len(scales)
            
            if total_members == 0:
                return 0
            
            return round(total_scales / total_members, 2)
            
        except Exception as e:
            print(f"DEBUG: Erro em get_avg_scales_per_member: {str(e)}")
            return 0
    
    def get_total_scales(self, start_date=None, end_date=None, ministry_id=None):
        """Retorna total de escalas"""
        try:
            query = Scale.query
            
            if start_date:
                query = query.filter(Scale.date >= start_date)
            if end_date:
                query = query.filter(Scale.date <= end_date)
            if ministry_id:
                query = query.filter(Scale.ministry_id == ministry_id)
            
            return query.count()
            
        except Exception as e:
            print(f"DEBUG: Erro em get_total_scales: {str(e)}")
            return 0
    
    def get_total_unavailability(self, start_date=None, end_date=None):
        """Retorna total de indisponibilidades"""
        try:
            query = UnavailabilityRequest.query
            
            if start_date:
                query = query.filter(UnavailabilityRequest.start_date >= start_date)
            if end_date:
                query = query.filter(UnavailabilityRequest.end_date <= end_date)
            
            return query.count()
            
        except Exception as e:
            print(f"DEBUG: Erro em get_total_unavailability: {str(e)}")
            return 0
    
    def get_detailed_report(self):
        """
        Retorna relatório detalhado com todos os dados
        """
        try:
            # Parâmetros
            start_date = request.args.get('start_date')
            end_date = request.args.get('end_date')
            ministry_id = request.args.get('ministry_id')
            report_type = request.args.get('type', 'overview')
            
            if start_date:
                start_date = datetime.strptime(start_date, '%Y-%m-%d')
            if end_date:
                end_date = datetime.strptime(end_date, '%Y-%m-%d')
            
            if report_type == 'scales':
                return self.get_scales_report(start_date, end_date, ministry_id)
            elif report_type == 'unavailability':
                return self.get_unavailability_report(start_date, end_date)
            elif report_type == 'members':
                return self.get_members_report(start_date, end_date, ministry_id)
            elif report_type == 'songs':
                return self.get_songs_report(start_date, end_date, ministry_id)
            else:
                # Relatório completo
                return jsonify({
                    'success': True,
                    'data': {
                        'scales_report': self.get_scales_report_data(start_date, end_date, ministry_id),
                        'unavailability_report': self.get_unavailability_report_data(start_date, end_date),
                        'members_report': self.get_members_report_data(start_date, end_date, ministry_id),
                        'songs_report': self.get_songs_report_data(start_date, end_date, ministry_id),
                        'ministries_report': self.get_ministries_report_data(start_date, end_date)
                    }
                })
                
        except Exception as e:
            print(f"DEBUG: Erro em get_detailed_report: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    def get_scales_report_data(self, start_date=None, end_date=None, ministry_id=None):
        """Dados do relatório de escalas"""
        try:
            query = Scale.query
            
            if start_date:
                query = query.filter(Scale.date >= start_date)
            if end_date:
                query = query.filter(Scale.date <= end_date)
            if ministry_id:
                query = query.filter(Scale.ministry_id == ministry_id)
            
            scales = query.all()
            
            # Estatísticas
            total_scales = len(scales)
            confirmed_scales = sum(1 for s in scales if s.status == 'confirmed')
            pending_scales = sum(1 for s in scales if s.status == 'pending')
            
            # Escalas por mês
            scales_by_month = {}
            for scale in scales:
                month_key = scale.date.strftime('%Y-%m') if scale.date else 'Sem data'
                scales_by_month[month_key] = scales_by_month.get(month_key, 0) + 1
            
            # Top 10 membros mais escalados
            member_scales = {}
            for scale in scales:
                if scale.members:
                    members_data = json.loads(scale.members) if isinstance(scale.members, str) else scale.members
                    for member in members_data:
                        member_id = member.get('id') if isinstance(member, dict) else member
                        if member_id:
                            member_scales[member_id] = member_scales.get(member_id, 0) + 1
            
            top_members = sorted(member_scales.items(), key=lambda x: x[1], reverse=True)[:10]
            top_members_data = []
            for member_id, count in top_members:
                user = User.query.get(member_id)
                if user:
                    top_members_data.append({
                        'user_id': user.id,
                        'name': user.name,
                        'count': count
                    })
            
            return {
                'total_scales': total_scales,
                'confirmed_scales': confirmed_scales,
                'pending_scales': pending_scales,
                'confirmation_rate': round((confirmed_scales / total_scales * 100), 2) if total_scales > 0 else 0,
                'scales_by_month': scales_by_month,
                'top_members': top_members_data
            }
            
        except Exception as e:
            print(f"DEBUG: Erro em get_scales_report_data: {str(e)}")
            return {
                'total_scales': 0,
                'confirmed_scales': 0,
                'pending_scales': 0,
                'confirmation_rate': 0,
                'scales_by_month': {},
                'top_members': []
            }
    
    def get_unavailability_report_data(self, start_date=None, end_date=None):
        """Dados do relatório de indisponibilidades"""
        try:
            query = UnavailabilityRequest.query
            
            if start_date:
                query = query.filter(UnavailabilityRequest.start_date >= start_date)
            if end_date:
                query = query.filter(UnavailabilityRequest.end_date <= end_date)
            
            requests = query.all()
            
            # Estatísticas
            total_requests = len(requests)
            approved = sum(1 for r in requests if r.status == 'approved')
            pending = sum(1 for r in requests if r.status == 'pending')
            rejected = sum(1 for r in requests if r.status == 'rejected')
            
            # Por mês
            requests_by_month = {}
            for req in requests:
                month_key = req.start_date.strftime('%Y-%m') if req.start_date else 'Sem data'
                requests_by_month[month_key] = requests_by_month.get(month_key, 0) + 1
            
            # Top 10 motivos
            reasons_count = {}
            for req in requests:
                reason = req.reason[:50] if req.reason else 'Sem motivo'
                reasons_count[reason] = reasons_count.get(reason, 0) + 1
            
            top_reasons = sorted(reasons_count.items(), key=lambda x: x[1], reverse=True)[:10]
            
            return {
                'total_requests': total_requests,
                'approved': approved,
                'pending': pending,
                'rejected': rejected,
                'approval_rate': round((approved / total_requests * 100), 2) if total_requests > 0 else 0,
                'requests_by_month': requests_by_month,
                'top_reasons': top_reasons
            }
            
        except Exception as e:
            print(f"DEBUG: Erro em get_unavailability_report_data: {str(e)}")
            return {
                'total_requests': 0,
                'approved': 0,
                'pending': 0,
                'rejected': 0,
                'approval_rate': 0,
                'requests_by_month': {},
                'top_reasons': []
            }
    
    def get_unavailability_history(self):
        """
        Retorna histórico de indisponibilidades
        """
        try:
            print("DEBUG: get_unavailability_history chamado")
            # Parâmetros
            user_id = request.args.get('user_id')
            months = int(request.args.get('months', 6))
            
            # Calcular data de início
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30 * months)
            
            query = UnavailabilityRequest.query.filter(
                UnavailabilityRequest.start_date >= start_date
            )
            
            if user_id:
                query = query.filter(UnavailabilityRequest.user_id == user_id)
            
            requests = query.order_by(
                UnavailabilityRequest.start_date.desc()
            ).all()
            
            # Organizar por mês
            history_by_month = {}
            for req in requests:
                month_key = req.start_date.strftime('%Y-%m') if req.start_date else 'Sem data'
                if month_key not in history_by_month:
                    history_by_month[month_key] = {
                        'total': 0,
                        'approved': 0,
                        'pending': 0,
                        'rejected': 0,
                        'avg_duration': 0,
                        'requests': []
                    }
                
                history_by_month[month_key]['total'] += 1
                history_by_month[month_key][req.status] = history_by_month[month_key].get(req.status, 0) + 1
                
                # Calcular duração
                if req.start_date and req.end_date:
                    duration = (req.end_date - req.start_date).days + 1
                    history_by_month[month_key]['avg_duration'] += duration
                
                # Adicionar detalhes da requisição
                user = User.query.get(req.user_id)
                history_by_month[month_key]['requests'].append({
                    'id': req.id,
                    'user_name': user.name if user else 'Usuário desconhecido',
                    'start_date': req.start_date.isoformat() if req.start_date else None,
                    'end_date': req.end_date.isoformat() if req.end_date else None,
                    'reason': req.reason,
                    'status': req.status,
                    'reviewed_by': req.reviewed_by,
                    'comment': req.comment
                })
            
            # Calcular média de duração
            for month in history_by_month:
                if history_by_month[month]['total'] > 0:
                    history_by_month[month]['avg_duration'] = round(
                        history_by_month[month]['avg_duration'] / history_by_month[month]['total'], 1
                    )
            
            return jsonify({
                'success': True,
                'data': {
                    'history': history_by_month,
                    'summary': {
                        'total_requests': sum(data['total'] for data in history_by_month.values()),
                        'avg_requests_per_month': round(
                            sum(data['total'] for data in history_by_month.values()) / len(history_by_month), 2
                        ) if history_by_month else 0
                    }
                }
            })
            
        except Exception as e:
            print(f"DEBUG: Erro em get_unavailability_history: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    def get_top_songs(self):
        """
        Retorna as músicas mais escaladas
        """
        try:
            print("DEBUG: get_top_songs chamado")
            # Parâmetros
            limit = int(request.args.get('limit', 10))
            start_date = request.args.get('start_date')
            end_date = request.args.get('end_date')
            
            if start_date:
                start_date = datetime.strptime(start_date, '%Y-%m-%d')
            if end_date:
                end_date = datetime.strptime(end_date, '%Y-%m-%d')
            
            top_songs = self.get_top_songs_data(start_date, end_date, None, limit)
            
            # Adicionar detalhes das músicas
            for song in top_songs:
                song_obj = Song.query.get(song['song_id'])
                if song_obj:
                    song['youtube_id'] = song_obj.youtube_id
                    song['duration'] = song_obj.duration
                    song['tags'] = json.loads(song_obj.tags) if song_obj.tags else []
            
            return jsonify({
                'success': True,
                'data': {
                    'top_songs': top_songs,
                    'summary': {
                        'total_unique_songs': len(top_songs),
                        'total_plays': sum(song['total'] for song in top_songs)
                    }
                }
            })
            
        except Exception as e:
            print(f"DEBUG: Erro em get_top_songs: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    def get_top_members(self):
        """
        Retorna os membros mais escalados
        """
        try:
            print("DEBUG: get_top_members chamado")
            # Parâmetros
            limit = int(request.args.get('limit', 10))
            start_date = request.args.get('start_date')
            end_date = request.args.get('end_date')
            ministry_id = request.args.get('ministry_id')
            role = request.args.get('role')
            
            print(f"DEBUG: Parâmetros - limit={limit}, start_date={start_date}, end_date={end_date}, ministry_id={ministry_id}")
            
            if start_date:
                start_date = datetime.strptime(start_date, '%Y-%m-%d')
            if end_date:
                end_date = datetime.strptime(end_date, '%Y-%m-%d')
            
            # Obter escalas
            scale_query = Scale.query
            
            if start_date:
                scale_query = scale_query.filter(Scale.date >= start_date)
            if end_date:
                scale_query = scale_query.filter(Scale.date <= end_date)
            if ministry_id:
                scale_query = scale_query.filter(Scale.ministry_id == int(ministry_id))
            
            scales = scale_query.all()
            print(f"DEBUG: Encontradas {len(scales)} escalas")
            
            # Contar participação
            member_data = {}
            for scale in scales:
                if scale.members:
                    members_data = json.loads(scale.members) if isinstance(scale.members, str) else scale.members
                    for member in members_data:
                        if isinstance(member, dict):
                            member_id = member.get('id')
                            member_role = member.get('role', '')
                            
                            # Filtrar por função se especificado
                            if role and role.lower() not in member_role.lower():
                                continue
                            
                            if member_id:
                                if member_id not in member_data:
                                    member_data[member_id] = {
                                        'total': 0,
                                        'roles': set(),
                                        'ministries': set()
                                    }
                                
                                member_data[member_id]['total'] += 1
                                member_data[member_id]['roles'].add(member_role)
                                member_data[member_id]['ministries'].add(scale.ministry_id)
            
            print(f"DEBUG: Dados de {len(member_data)} membros coletados")
            
            # Ordenar por total
            sorted_members = sorted(
                member_data.items(), 
                key=lambda x: x[1]['total'], 
                reverse=True
            )[:limit]
            
            result = []
            for member_id, data in sorted_members:
                user = User.query.get(member_id)
                if user:
                    # Obter ministérios do usuário
                    user_ministries = json.loads(user.ministries) if user.ministries else []
                    ministries_names = []
                    for ministry_id in user_ministries:
                        ministry = Ministry.query.get(ministry_id)
                        if ministry:
                            ministries_names.append(ministry.name)
                    
                    result.append({
                        'user_id': user.id,
                        'name': user.name,
                        'email': user.email,
                        'phone': user.phone,
                        'total_scales': data['total'],
                        'roles': list(data['roles']),
                        'scaled_ministries': list(data['ministries']),
                        'user_ministries': ministries_names,
                        'skills': json.loads(user.skills) if user.skills else []
                    })
            
            print(f"DEBUG: Retornando {len(result)} membros")
            
            return jsonify({
                'success': True,
                'data': {
                    'top_members': result,
                    'summary': {
                        'total_active_members': len(member_data),
                        'avg_scales_per_member': round(
                            sum(data['total'] for data in member_data.values()) / len(member_data), 2
                        ) if member_data else 0
                    }
                }
            })
            
        except Exception as e:
            print(f"DEBUG: Erro em get_top_members: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    # Métodos auxiliares para completar a implementação
    def get_scales_report(self, start_date=None, end_date=None, ministry_id=None):
        """Versão completa do relatório de escalas"""
        try:
            data = self.get_scales_report_data(start_date, end_date, ministry_id)
            return jsonify({
                'success': True,
                'data': data
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    def get_unavailability_report(self, start_date=None, end_date=None):
        """Versão completa do relatório de indisponibilidades"""
        try:
            data = self.get_unavailability_report_data(start_date, end_date)
            return jsonify({
                'success': True,
                'data': data
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    def get_members_report_data(self, start_date=None, end_date=None, ministry_id=None):
        """Dados do relatório de membros"""
        try:
            # Reutilizar get_top_members com limite maior
            scale_query = Scale.query
            
            if start_date:
                scale_query = scale_query.filter(Scale.date >= start_date)
            if end_date:
                scale_query = scale_query.filter(Scale.date <= end_date)
            if ministry_id:
                scale_query = scale_query.filter(Scale.ministry_id == ministry_id)
            
            scales = scale_query.all()
            
            # Estatísticas por membro
            members_stats = {}
            for scale in scales:
                if scale.members:
                    members_data = json.loads(scale.members) if isinstance(scale.members, str) else scale.members
                    for member in members_data:
                        if isinstance(member, dict):
                            member_id = member.get('id')
                            if member_id:
                                if member_id not in members_stats:
                                    members_stats[member_id] = {
                                        'total_scales': 0,
                                        'confirmed_scales': 0,
                                        'roles': set()
                                    }
                                
                                members_stats[member_id]['total_scales'] += 1
                                if scale.status == 'confirmed':
                                    members_stats[member_id]['confirmed_scales'] += 1
                                members_stats[member_id]['roles'].add(member.get('role', ''))
            
            # Converter para lista
            members_list = []
            for member_id, stats in members_stats.items():
                user = User.query.get(member_id)
                if user:
                    members_list.append({
                        'user_id': user.id,
                        'name': user.name,
                        'email': user.email,
                        'total_scales': stats['total_scales'],
                        'confirmed_scales': stats['confirmed_scales'],
                        'confirmation_rate': round((stats['confirmed_scales'] / stats['total_scales'] * 100), 2) if stats['total_scales'] > 0 else 0,
                        'roles': list(stats['roles'])
                    })
            
            # Ordenar por total de escalas
            members_list.sort(key=lambda x: x['total_scales'], reverse=True)
            
            return {
                'members': members_list,
                'total_members': len(members_list),
                'avg_scales_per_member': round(
                    sum(m['total_scales'] for m in members_list) / len(members_list), 2
                ) if members_list else 0
            }
            
        except Exception as e:
            print(f"DEBUG: Erro em get_members_report_data: {str(e)}")
            return {
                'members': [],
                'total_members': 0,
                'avg_scales_per_member': 0
            }
    
    def get_members_report(self, start_date=None, end_date=None, ministry_id=None):
        """Versão completa do relatório de membros"""
        try:
            data = self.get_members_report_data(start_date, end_date, ministry_id)
            return jsonify({
                'success': True,
                'data': data
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    def get_songs_report_data(self, start_date=None, end_date=None, ministry_id=None):
        """Dados do relatório de músicas"""
        try:
            songs = self.get_top_songs_data(start_date, end_date, ministry_id, limit=50)
            
            # Adicionar mais detalhes
            for song in songs:
                song_obj = Song.query.get(song['song_id'])
                if song_obj:
                    song['youtube_id'] = song_obj.youtube_id
                    song['duration'] = song_obj.duration
                    song['tags'] = json.loads(song_obj.tags) if song_obj.tags else []
                    song['created_at'] = song_obj.created_at.isoformat() if song_obj.created_at else None
            
            return {
                'songs': songs,
                'total_songs': len(songs),
                'total_plays': sum(song['total'] for song in songs)
            }
            
        except Exception as e:
            print(f"DEBUG: Erro em get_songs_report_data: {str(e)}")
            return {
                'songs': [],
                'total_songs': 0,
                'total_plays': 0
            }
    
    def get_songs_report(self, start_date=None, end_date=None, ministry_id=None):
        """Versão completa do relatório de músicas"""
        try:
            data = self.get_songs_report_data(start_date, end_date, ministry_id)
            return jsonify({
                'success': True,
                'data': data
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    def get_ministries_report_data(self, start_date=None, end_date=None):
        """Dados do relatório de ministérios"""
        try:
            ministries = Ministry.query.all()
            
            result = []
            for ministry in ministries:
                # Contar escalas do ministério
                scale_query = Scale.query.filter_by(ministry_id=ministry.id)
                
                if start_date:
                    scale_query = scale_query.filter(Scale.date >= start_date)
                if end_date:
                    scale_query = scale_query.filter(Scale.date <= end_date)
                
                total_scales = scale_query.count()
                confirmed_scales = scale_query.filter_by(status='confirmed').count()
                
                # Contar membros do ministério
                members_count = 0
                if ministry.members:
                    members_data = json.loads(ministry.members) if isinstance(ministry.members, str) else ministry.members
                    members_count = len(members_data)
                
                result.append({
                    'ministry_id': ministry.id,
                    'name': ministry.name,
                    'total_scales': total_scales,
                    'confirmed_scales': confirmed_scales,
                    'confirmation_rate': round((confirmed_scales / total_scales * 100), 2) if total_scales > 0 else 0,
                    'members_count': members_count,
                    'leader_name': ministry.leader.name if ministry.leader else None
                })
            
            # Ordenar por total de escalas
            result.sort(key=lambda x: x['total_scales'], reverse=True)
            
            return {
                'ministries': result,
                'total_ministries': len(result),
                'total_scales': sum(m['total_scales'] for m in result),
                'avg_scales_per_ministry': round(
                    sum(m['total_scales'] for m in result) / len(result), 2
                ) if result else 0
            }
            
        except Exception as e:
            print(f"DEBUG: Erro em get_ministries_report_data: {str(e)}")
            return {
                'ministries': [],
                'total_ministries': 0,
                'total_scales': 0,
                'avg_scales_per_ministry': 0
            }

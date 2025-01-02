from odoo import models, fields

class PropertyTag(models.Model):
    _name = "real.estate.tags"
    _description = "Estate tags"
    
    name = fields.Char(required=True)
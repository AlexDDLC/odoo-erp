from odoo import models, fields


class RealEstateType(models.Model):
    _name = "real.estate.type"
    _description = "Real Estate Types"

    name = fields.Char(string="Name")
    status = fields.Boolean()

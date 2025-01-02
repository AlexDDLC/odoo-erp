from odoo import models, fields


class RealEstate(models.Model):
    _name = "real.estate"
    _description = "Test model"

    active = fields.Boolean(default=True)
    name = fields.Char(required=True)
    estate = fields.Selection(
        [
            ("new", "New"),
            ("received", "Offer Received"),
            ("accepted", "Offer Accepted"),
            ("sold", "Sold"),
            ("canceled", "Canceled"),
        ],
        required=True,
        copy=False,
        default="new",
    )
    postcode = fields.Char()

    def _default_date(self):
        return fields.Date.today()

    date_availability = fields.Date(default=_default_date, copy=False)
    expeted_price = fields.Float()
    best_offert = fields.Float()
    selling_price = fields.Float()

    description = fields.Text()
    bedrooms = fields.Integer()
    living_area = fields.Integer()
    facades = fields.Integer()
    garage = fields.Boolean()
    garden_area = fields.Integer()
    total_area = fields.Integer()
    garden_orientation = fields.Selection(
        [("north", "North"), ("south", "South"), ("east", "East"), ("west", "West")]
    )
    estate_type_id = fields.Many2one("real.estate.type")
    offer_ids = fields.One2many("estate.property.offer", "property_id")
    tag_ides = fields.Many2many("real.estate.tags")

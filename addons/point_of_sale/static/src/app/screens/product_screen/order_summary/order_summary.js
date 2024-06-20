/** @odoo-module */

import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { OrderWidget } from "@point_of_sale/app/generic_components/order_widget/order_widget";
import { useService } from "@web/core/utils/hooks";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { parseFloat } from "@web/views/fields/parsers";

export class OrderSummary extends Component {
    static template = "point_of_sale.OrderSummary";
    static components = {
        Orderline,
        OrderWidget,
    };
    static props = {};

    setup() {
        super.setup();
        this.numberBuffer = useService("number_buffer");
        this.dialog = useService("dialog");
        this.pos = usePos();

        this.numberBuffer.use({
            triggerAtInput: (...args) => this.updateSelectedOrderline(...args),
            useWithBarcode: true,
        });
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    selectLine(orderline) {
        this.numberBuffer.reset();
        this.currentOrder.select_orderline(orderline);
    }

    async updateSelectedOrderline({ buffer, key }) {
        const order = this.pos.get_order();
        const selectedLine = order.get_selected_orderline();
        // This validation must not be affected by `disallowLineQuantityChange`
        if (selectedLine && selectedLine.isTipLine() && this.pos.numpadMode !== "price") {
            /**
             * You can actually type numbers from your keyboard, while a popup is shown, causing
             * the number buffer storage to be filled up with the data typed. So we force the
             * clean-up of that buffer whenever we detect this illegal action.
             */
            this.numberBuffer.reset();
            if (key === "Backspace") {
                this._setValue("remove");
            } else {
                this.dialog.add(AlertDialog, {
                    title: _t("Cannot modify a tip"),
                    body: _t("Customer tips, cannot be modified directly"),
                });
            }
            return;
        }
        if (
            selectedLine &&
            this.pos.numpadMode === "quantity" &&
            this.pos.disallowLineQuantityChange()
        ) {
            const orderlines = order.orderlines;
            const lastId = orderlines.length !== 0 && orderlines.at(orderlines.length - 1).cid;
            const currentQuantity = this.pos.get_order().get_selected_orderline().get_quantity();

            if (selectedLine.noDecrease) {
                this.dialog.add(AlertDialog, {
                    title: _t("Invalid action"),
                    body: _t("You are not allowed to change this quantity"),
                });
                return;
            }
            const parsedInput = (buffer && parseFloat(buffer)) || 0;
            if (lastId != selectedLine.cid) {
                this._showDecreaseQuantityPopup();
            } else if (currentQuantity < parsedInput) {
                this._setValue(buffer);
            } else if (parsedInput < currentQuantity) {
                this._showDecreaseQuantityPopup();
            }
            return;
        } else if (
            selectedLine &&
            this.pos.numpadMode === "discount" &&
            this.pos.disallowLineDiscountChange()
        ) {
            this.numberBuffer.reset();
            const inputNumber = await makeAwaitable(this.dialog, NumberPopup, {
                startingValue: 10,
                title: _t("Set the new discount"),
                isInputSelected: true,
            });
            if (inputNumber) {
                await this.pos.setDiscountFromUI(selectedLine, inputNumber);
            }
            return;
        }
        const val = buffer === null ? "remove" : buffer;
        this._setValue(val);
        if (val == "remove") {
            this.numberBuffer.reset();
            this.pos.numpadMode = "quantity";
        }
    }

    _setValue(val) {
        const { numpadMode } = this.pos;
        let selectedLine = this.currentOrder.get_selected_orderline();
        if (selectedLine) {
            if (numpadMode === "quantity") {
                if (selectedLine.combo_parent_id) {
                    selectedLine = selectedLine.combo_parent_id;
                }
                if (val === "remove") {
                    this.currentOrder.removeOrderline(selectedLine);
                } else {
                    const result = selectedLine.set_quantity(
                        val,
                        Boolean(selectedLine.combo_line_ids?.length)
                    );
                    if (selectedLine.combo_line_ids) {
                        for (const line of selectedLine.combo_line_ids) {
                            line.set_quantity(val, true);
                        }
                    }
                    if (!result) {
                        this.numberBuffer.reset();
                    }
                }
            } else if (numpadMode === "discount") {
                this.pos.setDiscountFromUI(selectedLine, val);
            } else if (numpadMode === "price") {
                selectedLine.price_type = "manual";
                selectedLine.set_unit_price(val);
            }
        }
    }

    async _showDecreaseQuantityPopup() {
        this.numberBuffer.reset();
        const inputNumber = await makeAwaitable(this.dialog, NumberPopup, {
            title: _t("Set the new quantity"),
        });
        if (inputNumber) {
            const newQuantity = inputNumber && inputNumber !== "" ? parseFloat(inputNumber) : null;
            return await this.updateQuantityNumber(newQuantity);
        }
    }
    async updateQuantityNumber(newQuantity) {
        if (newQuantity !== null) {
            const order = this.pos.get_order();
            const selectedLine = order.get_selected_orderline();
            const currentQuantity = selectedLine.get_quantity();
            if (newQuantity >= currentQuantity) {
                selectedLine.set_quantity(newQuantity);
            } else if (newQuantity >= selectedLine.saved_quantity) {
                await this.handleDecreaseUnsavedLine(newQuantity);
            } else {
                await this.handleDecreaseLine(newQuantity);
            }
            return true;
        }
        return false;
    }
    async handleDecreaseUnsavedLine(newQuantity) {
        const order = this.pos.get_order();
        const selectedLine = order.get_selected_orderline();
        const decreaseQuantity = selectedLine.get_quantity() - newQuantity;
        selectedLine.set_quantity(newQuantity);
        if (newQuantity == 0) {
            order._unlinkOrderline(selectedLine);
        }
        return decreaseQuantity;
    }
    async handleDecreaseLine(newQuantity) {
        const order = this.pos.get_order();
        const selectedLine = order.get_selected_orderline();
        let current_saved_quantity = 0;
        for (const line of order.orderlines) {
            if (line === selectedLine) {
                current_saved_quantity += line.saved_quantity;
            } else if (
                line.product.id === selectedLine.product.id &&
                line.get_unit_price() === selectedLine.get_unit_price()
            ) {
                current_saved_quantity += line.quantity;
            }
        }
        const newLine = this.getNewLine();
        const decreasedQuantity = current_saved_quantity - newQuantity;
        newLine.order = this.currentOrder;
        if (decreasedQuantity != 0) {
            if (newLine === selectedLine) {
                selectedLine.set_quantity(newQuantity, true);
            } else {
                newLine.set_quantity(-decreasedQuantity, true);
                order.add_orderline(newLine);
            }
        }
        if (newLine !== selectedLine && selectedLine.saved_quantity != 0) {
            selectedLine.set_quantity(selectedLine.saved_quantity);
        }
        return decreasedQuantity;
    }
    getNewLine() {
        const selectedLine = this.currentOrder.get_selected_orderline();
        let newLine = selectedLine;
        if (selectedLine.saved_quantity != 0) {
            newLine = selectedLine.clone();
            newLine.refunded_orderline_id = selectedLine.refunded_orderline_id;
        }
        return newLine;
    }
}

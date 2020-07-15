import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss']
})
export class ConfirmDialogComponent implements OnInit {

  dialogTitle: 'Confirm';
  dialogText: 'Would you like to confirm?';
  submitText: 'Yes'

  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {
    if (this.data.dialogTitle) { this.dialogTitle = this.data.dialogTitle };
    if (this.data.dialogText) { this.dialogText = this.data.dialogText };
    if (this.data.submitText) { this.submitText = this.data.submitText };
  }

  ngOnInit(): void {
  }

}

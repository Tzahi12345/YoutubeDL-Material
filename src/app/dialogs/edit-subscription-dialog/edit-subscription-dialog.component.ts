import { Component, OnInit, Inject, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { PostsService } from 'app/posts.services';
import { ArgModifierDialogComponent } from '../arg-modifier-dialog/arg-modifier-dialog.component';

@Component({
  selector: 'app-edit-subscription-dialog',
  templateUrl: './edit-subscription-dialog.component.html',
  styleUrls: ['./edit-subscription-dialog.component.scss']
})
export class EditSubscriptionDialogComponent implements OnInit {

  updating = false;

  sub = null;
  new_sub = null;

  editor_initialized = false;

  timerange_amount: number;
  timerange_unit = 'days';
  audioOnlyMode = null;
  download_all = null;


  time_units = [
    'day',
    'week',
    'month',
    'year'
  ];

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, private dialog: MatDialog, private postsService: PostsService) {
    this.sub = this.data.sub;
    this.new_sub = JSON.parse(JSON.stringify(this.sub));

    this.audioOnlyMode = this.sub.type === 'audio';
    this.download_all = !this.sub.timerange;

    if (this.sub.timerange) {
      const timerange_str = this.sub.timerange.split('-')[1];
      console.log(timerange_str);
      const number = timerange_str.replace(/\D/g,'');
      let units = timerange_str.replace(/[0-9]/g, '');

      console.log(units);

      // // remove plural on units
      // if (units[units.length-1] === 's') {
      //   units = units.substring(0, units.length-1);
      // }

      this.timerange_amount = parseInt(number);
      this.timerange_unit = units;
      this.editor_initialized = true;
    } else {
      this.editor_initialized = true
    }
  }

  ngOnInit(): void {
  }

  downloadAllToggled() {
    if (this.download_all) {
      this.new_sub.timerange = null;
    } else {
      console.log('checking');
      this.timerangeChanged(null, null);
    }
  }

  saveSubscription() {
    this.postsService.updateSubscription(this.new_sub).subscribe(res => {
      this.sub = this.new_sub;
      this.new_sub = JSON.parse(JSON.stringify(this.sub));
      this.postsService.reloadSubscriptions();
    })
  }

  getSubscription() {
    this.postsService.getSubscription(this.sub.id).subscribe(res => {
      this.sub = res['subscription'];
      this.new_sub = JSON.parse(JSON.stringify(this.sub));
    });
  }

  timerangeChanged(value, select_changed) {
    console.log(this.timerange_amount);
    console.log(this.timerange_unit);

    if (this.timerange_amount && this.timerange_unit && !this.download_all) {
      this.new_sub.timerange = 'now-' + this.timerange_amount.toString() + this.timerange_unit;
      console.log(this.new_sub.timerange);
    } else {
      this.new_sub.timerange = null;
    }
  }

  saveClicked() {
    this.saveSubscription();
  }

  // modify custom args
  openArgsModifierDialog() {
    if (!this.new_sub.custom_args) {
      this.new_sub.custom_args = '';
    }
    const dialogRef = this.dialog.open(ArgModifierDialogComponent, {
      data: {
       initial_args: this.new_sub.custom_args
      }
    });
    dialogRef.afterClosed().subscribe(new_args => {
      if (new_args !== null && new_args !== undefined) {
        this.new_sub.custom_args = new_args;
      }
    });
  }

  subChanged() {
    return JSON.stringify(this.new_sub) !== JSON.stringify(this.sub);
  }

}

import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-edit-subscription-dialog',
  templateUrl: './edit-subscription-dialog.component.html',
  styleUrls: ['./edit-subscription-dialog.component.scss']
})
export class EditSubscriptionDialogComponent implements OnInit {

  sub = null;
  new_sub = null;

  timerange_amount: string;
  timerange_unit = 'days';

  time_units = [
    'day',
    'week',
    'month',
    'year'
  ];

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, private postsService: PostsService) {
    this.sub = this.data.sub;
    this.new_sub = JSON.parse(JSON.stringify(this.sub));
  }

  ngOnInit(): void {
  }

  saveSubscription() {
    this.postsService.updateSubscription(this.sub).subscribe(res => {
      this.sub = res['subscription'];
      this.new_sub = JSON.parse(JSON.stringify(this.sub));
    })
  }

  getSubscription() {
    this.postsService.getSubscription(this.sub.id).subscribe(res => {
      this.sub = res['subscription'];
      this.new_sub = JSON.parse(JSON.stringify(this.sub));
    });
  }

  timerangeChanged(value, select_changed) {
    console.log(value);
    console.log(this.timerange_amount);
    console.log(this.timerange_unit);
  }

}

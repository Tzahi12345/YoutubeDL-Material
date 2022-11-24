import { Component, ElementRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import { Router } from '@angular/router';
import { PostsService } from 'app/posts.services';
import { Notification } from 'api-types';

// TODO: fill this out
const NOTIFICATION_ACTION_TO_STRING = {}

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {

  notifications = null;
  read_notifications = null;

  @Input() menu: MatMenuTrigger;
  @Output() notificationCount = new EventEmitter<number>();

  constructor(public postsService: PostsService, private router: Router, private elRef: ElementRef) { }

  ngOnInit(): void {
    // wait for init
    if (this.postsService.initialized) {
      this.getNotifications();
    } else {
      this.postsService.service_initialized.subscribe(init => {
        if (init) {
          this.getNotifications();
        }
      });
    }
  }

  getNotifications(): void {
    this.postsService.getNotifications().subscribe(res => {
      this.notifications = res['notifications'].filter(notification => notification.read == false);
      this.read_notifications = res['notifications'].filter(notification => notification.read == true);
      this.notificationCount.emit(this.notifications.length);
    });
  }

  notificationAction(notification: Notification): void {
    // TODO: implement
  }
  
  deleteNotification(uid: string, index: number): void {
    this.postsService.deleteNotification(uid).subscribe(res => {
      console.log(res);
      // TODO: remove from array
      this.notificationCount.emit(this.notifications.length);
    });
  }

  deleteAllNotifications(): void {
    this.postsService.deleteAllNotifications().subscribe(res => {
      console.log(res);
      this.notifications = [];
      this.read_notifications = [];
      this.getNotifications();
    });
    this.notificationCount.emit(0);
  }

  setNotificationsToRead(): void {
    const uids = this.notifications.map(notification => notification.uid);
    this.postsService.setNotificationsToRead(uids).subscribe(res => {
      console.log(res);
    });
    this.notificationCount.emit(0);
  }

}

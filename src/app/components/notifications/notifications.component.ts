import { Component, ElementRef, EventEmitter, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { PostsService } from 'app/posts.services';
import { Notification } from 'api-types';
import { NotificationAction } from 'api-types/models/NotificationAction';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {

  notifications = null;
  read_notifications = null;

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
      this.notifications = res['notifications'].filter(notification => !notification.read);
      this.read_notifications = res['notifications'].filter(notification => notification.read);
      this.notificationCount.emit(this.notifications.length);
    });
  }

  notificationAction(action_info: {notification: Notification, action: NotificationAction}): void {
    switch (action_info['action']) {
      case NotificationAction.PLAY:
        this.router.navigate(['player', {uid: action_info['notification']['data']['file_uid']}]);
        break;
      case NotificationAction.VIEW_DOWNLOAD_ERROR:
        this.router.navigate(['downloads']);
        break;
      case NotificationAction.RETRY_DOWNLOAD:
        this.postsService.restartDownload(action_info['notification']['data']['download_uid'])
        break;
      default:
        console.error(`Notification action ${action_info['action']} does not exist!`);
        break;
    }
  }

  deleteNotification(uid: string): void {
    this.postsService.deleteNotification(uid).subscribe(res => {
      this.notifications.filter(notification => notification['uid'] !== uid);
      this.read_notifications.filter(read_notification => read_notification['uid'] !== uid);
      this.notificationCount.emit(this.notifications.length);
      this.getNotifications();
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

  notificationMenuClosed(): void {
    if (this.notifications.length > 0) {
      this.setNotificationsToRead();
    }
  }

}

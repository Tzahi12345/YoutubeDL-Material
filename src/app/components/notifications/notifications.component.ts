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

  notifications: Notification[] = null;

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
      this.notifications = res['notifications'];
      this.notificationCount.emit(this.notifications.filter(notification => !notification.read).length);
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
        this.postsService.restartDownload(action_info['notification']['data']['download_uid']).subscribe(res => {
          this.postsService.openSnackBar($localize`Download restarted!`);
          this.deleteNotification(action_info['notification']['uid']);
        });
        break;
      default:
        console.error(`Notification action ${action_info['action']} does not exist!`);
        break;
    }
  }

  deleteNotification(uid: string): void {
    this.postsService.deleteNotification(uid).subscribe(res => {
      this.notifications.filter(notification => notification['uid'] !== uid);
      this.notificationCount.emit(this.notifications.length);
      this.getNotifications();
    });
  }

  deleteAllNotifications(): void {
    this.postsService.deleteAllNotifications().subscribe(res => {
      this.notifications = [];
      this.getNotifications();
    });
    this.notificationCount.emit(0);
  }

  setNotificationsToRead(): void {
    const uids = this.notifications.map(notification => notification.uid);
    this.postsService.setNotificationsToRead(uids).subscribe(res => {
      this.getNotifications();
    });
    this.notificationCount.emit(0);
  }

}

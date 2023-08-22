import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Schedule, Task } from 'api-types';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-update-task-schedule-dialog',
  templateUrl: './update-task-schedule-dialog.component.html',
  styleUrls: ['./update-task-schedule-dialog.component.scss']
})
export class UpdateTaskScheduleDialogComponent implements OnInit {

  enabled = true;
  recurring = false;
  days_of_week = [];
  interval = 'daily';
  time = null;
  minute = null;
  date: Date = null;
  today = new Date();
  Intl = Intl;

  constructor(@Inject(MAT_DIALOG_DATA) public data: {task: Task}, private dialogRef: MatDialogRef<UpdateTaskScheduleDialogComponent>, private postsService: PostsService) {
    this.processTask(this.data.task);
    this.postsService.getTask(this.data.task.key).subscribe(res => {
      this.processTask(res['task']);
    });
  }

  ngOnInit(): void {
  }

  processTask(task: Task): void {
    if (!task['schedule']) {
      this.enabled = false;
      return;
    }

    const schedule: Schedule = task['schedule'];

    this.recurring = schedule['type'] === Schedule.type.RECURRING;

    if (this.recurring) {
      const hour = schedule['data']['hour'];
      const minute = schedule['data']['minute'];

      this.time = (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;

      if (schedule['data']['dayOfWeek']) {
        this.days_of_week = schedule['data']['dayOfWeek'];
        this.interval = (hour != null) ? 'weekly' : 'hourly';
      }
      else {
        this.interval = 'daily';
      }
    } else {
      const schedule_date = new Date(schedule['data']['timestamp']);
      this.time = `${schedule_date.getHours()}:${schedule_date.getMinutes()}`
      this.date = schedule_date;
    }
  }

  updateTaskSchedule(): void {
    if (!this.enabled) {
      this.dialogRef.close(null);
      return;
    }

    if (!this.time && this.interval !== 'hourly') {
      // needs time!
      this.postsService.openSnackBar($localize`You must input a time!`);
      return;
    }

    const hours = (this.interval !== 'hourly') ? parseInt(this.time.split(':')[0]) : null;
    const minutes = (this.interval !== 'hourly') ? parseInt(this.time.split(':')[1]) : parseInt(this.minute);

    const schedule: Schedule = {type: this.recurring ? Schedule.type.RECURRING : Schedule.type.TIMESTAMP, data: null};
    if (this.recurring) {
      schedule['data'] = {hour: hours, minute: minutes};
      if (this.interval === 'weekly' || this.interval === 'hourly') {
        schedule['data']['dayOfWeek'] = this.days_of_week;
      }
    } else {
      this.date.setHours(hours, minutes);
      schedule['data'] = {timestamp: this.date.getTime()};
    }
    schedule['data']['tz'] = this.Intl?.DateTimeFormat().resolvedOptions().timeZone;
    this.dialogRef.close(schedule);
  }
}

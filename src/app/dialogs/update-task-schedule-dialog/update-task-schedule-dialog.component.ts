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
  date = null;
  today = new Date();

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

      // add padding 0s if necessary to hours and minutes
      this.time = (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;

      if (schedule['data']['dayOfWeek']) {
        this.days_of_week = schedule['data']['dayOfWeek'];
        this.interval = 'weekly';
      } else {
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

    if (!this.time) {
      // needs time!
    }

    const hours = parseInt(this.time.split(':')[0]);
    const minutes = parseInt(this.time.split(':')[1]);

    const schedule: Schedule = {type: this.recurring ? Schedule.type.RECURRING : Schedule.type.TIMESTAMP, data: null};
    if (this.recurring) {
      schedule['data'] = {hour: hours, minute: minutes};
      if (this.interval === 'weekly') {
        schedule['data']['dayOfWeek'] = this.days_of_week;
      }
    } else {
      this.date.setHours(hours, minutes);
      schedule['data'] = {timestamp: this.date.getTime()};
    }
    this.dialogRef.close(schedule);
  }
}

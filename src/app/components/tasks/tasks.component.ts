import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { UpdateTaskScheduleDialogComponent } from 'app/dialogs/update-task-schedule-dialog/update-task-schedule-dialog.component';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss']
})
export class TasksComponent implements OnInit {

  interval_id = null;
  tasks_check_interval = 1500;
  tasks = null;
  tasks_retrieved = false;

  displayedColumns: string[] = ['title', 'last_ran', 'last_confirmed', 'status', 'actions'];
  dataSource = null;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  constructor(private postsService: PostsService, private dialog: MatDialog) { }

  ngOnInit(): void {
    if (this.postsService.initialized) {
      this.getTasksRecurring();
    } else {
      this.postsService.service_initialized.subscribe(init => {
        if (init) {
          this.getTasksRecurring();
        }
      });
    }
  }

  ngOnDestroy(): void {
    if (this.interval_id) { clearInterval(this.interval_id) }
  }

  getTasksRecurring(): void {
    this.getTasks();
    this.interval_id = setInterval(() => {
      this.getTasks();
    }, this.tasks_check_interval);
  }

  getTasks(): void {
    this.postsService.getTasks().subscribe(res => {
      if (this.tasks) {
        if (JSON.stringify(this.tasks) === JSON.stringify(res['tasks'])) return;
        for (const task of res['tasks']) {
          const task_index = this.tasks.map(t => t.key).indexOf(task['key']);
          this.tasks[task_index] = task;
        }
        this.dataSource = new MatTableDataSource<Task>(this.tasks);
      } else {
        this.tasks = res['tasks'];
        this.dataSource = new MatTableDataSource<Task>(this.tasks);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      }
    });
  }

  runTask(task_key: string): void {
    this.postsService.runTask(task_key).subscribe(res => {
      this.getTasks();
    });
  }

  confirmTask(task_key: string): void {
    this.postsService.confirmTask(task_key).subscribe(res => {
      this.getTasks();
    });
  }

  scheduleTask(task: any): void {
    // open dialog
    const dialogRef = this.dialog.open(UpdateTaskScheduleDialogComponent, {
      data: {
        task: task
      }
    });
    dialogRef.afterClosed().subscribe(schedule => {
      if (schedule || schedule === null) {
        this.postsService.updateTaskSchedule(task['key'], schedule).subscribe(res => {
          this.getTasks();
          console.log(res);
        });
      }
    });
  }

}

export interface Task {
  key: string;
  title: string;
  last_ran: number;
  last_confirmed: number;
  running: boolean;
  confirming: boolean;
  data: unknown;
}
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { VideoInfoDialogComponent } from './video-info-dialog.component';

describe('VideoInfoDialogComponent', () => {
  let component: VideoInfoDialogComponent;
  let fixture: ComponentFixture<VideoInfoDialogComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ VideoInfoDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(VideoInfoDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

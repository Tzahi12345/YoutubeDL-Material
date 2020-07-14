import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { RecentVideosComponent } from './recent-videos.component';

describe('RecentVideosComponent', () => {
  let component: RecentVideosComponent;
  let fixture: ComponentFixture<RecentVideosComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ RecentVideosComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RecentVideosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

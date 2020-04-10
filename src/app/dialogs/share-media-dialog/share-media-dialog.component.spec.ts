import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ShareMediaDialogComponent } from './share-media-dialog.component';

describe('ShareMediaDialogComponent', () => {
  let component: ShareMediaDialogComponent;
  let fixture: ComponentFixture<ShareMediaDialogComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ShareMediaDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ShareMediaDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

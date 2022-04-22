import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RestoreDbDialogComponent } from './restore-db-dialog.component';

describe('RestoreDbDialogComponent', () => {
  let component: RestoreDbDialogComponent;
  let fixture: ComponentFixture<RestoreDbDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RestoreDbDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RestoreDbDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

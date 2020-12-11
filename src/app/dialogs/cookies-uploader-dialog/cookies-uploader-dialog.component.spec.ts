import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { CookiesUploaderDialogComponent } from './cookies-uploader-dialog.component';

describe('CookiesUploaderDialogComponent', () => {
  let component: CookiesUploaderDialogComponent;
  let fixture: ComponentFixture<CookiesUploaderDialogComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ CookiesUploaderDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CookiesUploaderDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

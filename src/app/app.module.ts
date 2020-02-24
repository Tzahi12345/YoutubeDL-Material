import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import {MatNativeDateModule, MatRadioModule, MatInputModule, MatButtonModule, MatSidenavModule, MatIconModule, MatListModule,
  MatSnackBarModule, MatCardModule, MatSelectModule, MatToolbarModule, MatCheckboxModule, MatGridListModule,
  MatProgressBarModule, MatExpansionModule,
  MatGridList,
  MatProgressSpinnerModule,
  MatButtonToggleModule,
  MatDialogModule} from '@angular/material';
  import {DragDropModule} from '@angular/cdk/drag-drop';
  import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { AppComponent } from './app.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import { HttpModule } from '@angular/http';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { PostsService } from 'app/posts.services';
import {APP_BASE_HREF} from '@angular/common';
import { FileCardComponent } from './file-card/file-card.component';
import {RouterModule} from '@angular/router';
import { AppRoutingModule } from './app-routing.module';
import { MainComponent } from './main/main.component';
import { PlayerComponent } from './player/player.component';
import {VgCoreModule} from 'videogular2/compiled/core';
import {VgControlsModule} from 'videogular2/compiled/controls';
import {VgOverlayPlayModule} from 'videogular2/compiled/overlay-play';
import {VgBufferingModule} from 'videogular2/compiled/buffering';
import { InputDialogComponent } from './input-dialog/input-dialog.component';
import { LazyLoadImageModule, IsVisibleProps } from 'ng-lazyload-image';
import { NgxContentLoadingModule } from 'ngx-content-loading';
import { audioFilesMouseHovering, videoFilesMouseHovering } from './main/main.component';
import { Observable } from 'rxjs';
import { CreatePlaylistComponent } from './create-playlist/create-playlist.component';

function isVisible({ event, element, scrollContainer, offset }: IsVisibleProps<any>) {
  return (element.id === 'video' ? videoFilesMouseHovering : audioFilesMouseHovering);
}

@NgModule({
  declarations: [
    AppComponent,
    FileCardComponent,
    MainComponent,
    PlayerComponent,
    InputDialogComponent,
    CreatePlaylistComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MatNativeDateModule,
    MatRadioModule,
    FormsModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    HttpModule,
    HttpClientModule,
    MatToolbarModule,
    MatCardModule,
    MatSnackBarModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSidenavModule,
    MatIconModule,
    MatListModule,
    MatGridListModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatDialogModule,
    DragDropModule,
    VgCoreModule,
    VgControlsModule,
    VgOverlayPlayModule,
    VgBufferingModule,
    LazyLoadImageModule.forRoot({ isVisible }),
    NgxContentLoadingModule,
    RouterModule,
    AppRoutingModule,
  ],
  entryComponents: [
    InputDialogComponent,
    CreatePlaylistComponent
  ],
  providers: [PostsService],
  bootstrap: [AppComponent]
})
export class AppModule { }

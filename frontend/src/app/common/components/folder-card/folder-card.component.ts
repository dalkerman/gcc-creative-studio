import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-folder-card',
  templateUrl: './folder-card.component.html',
  styleUrl: './folder-card.component.scss'
})
export class FolderCardComponent {
  @Input() folder!: {title: string};
}

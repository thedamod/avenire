# A disposable window containing only synthetic data. Close it when finished.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Avenire desktop exploration'
$form.Size = New-Object System.Drawing.Size(560,400)
$form.StartPosition = 'CenterScreen'
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Status: waiting'
$label.Location = New-Object System.Drawing.Point(30,25)
$label.Size = New-Object System.Drawing.Size(460,35)
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Run experiment'
$button.AccessibleName = 'Run experiment'
$button.Location = New-Object System.Drawing.Point(30,70)
$button.Size = New-Object System.Drawing.Size(180,40)
$button.Add_Click({ $label.Text = 'Status: experiment completed' })
$panel = New-Object System.Windows.Forms.Panel
$panel.Location = New-Object System.Drawing.Point(30,135)
$panel.Size = New-Object System.Drawing.Size(470,180)
$panel.Add_Paint({
  param($sender,$event)
  $event.Graphics.Clear([System.Drawing.Color]::White)
  $event.Graphics.FillEllipse([System.Drawing.Brushes]::OrangeRed,40,25,95,95)
  $event.Graphics.DrawString('Canvas-only: orange planet', (New-Object System.Drawing.Font('Arial',14)), [System.Drawing.Brushes]::Black,150,65)
})
$form.Controls.AddRange(@($label,$button,$panel))
[System.Windows.Forms.Application]::Run($form)

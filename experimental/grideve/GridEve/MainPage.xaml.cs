using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.IO;
using System.Linq;
using System.Windows.Input;
using System.Windows;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Foundation;
using Windows.Foundation.Collections;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Controls.Primitives;
using Windows.UI.Xaml.Data;
using Windows.UI.Xaml.Input;
using Windows.UI.Xaml.Media;
using Windows.UI.Xaml.Navigation;
using Windows.UI.Xaml.Shapes;
using Windows.UI;
using Microsoft.Graphics.Canvas.UI.Xaml;
using Microsoft.Graphics.Canvas.Effects;
using Microsoft.Graphics.Canvas.Geometry;
using System.Threading.Tasks;
using EveColors;

namespace GridEve
{
    using AST = Tree<Token>;

    // A cell contains a node in the dataflow network
    public class Cell : UserControl
    {
        public Guid ID;
        public CellPos Position;
        public uint GridSize = 25;
        public bool OutputCell = false;
        public bool IsRoot = false;

        private Cell SelectedCell = null;
        private bool Filled = false;
        private bool IsFullScreen = false;
        private bool Collapsed = false;

        private DataflowNetwork Flow = new DataflowNetwork();
        private Parser Parser = new Parser();
        private Border Border = new Border();
        public Canvas Canvas = new Canvas();
        private InkCanvas InkCanvas;
        private CellTextEntry TextEntry;
        private TextBlock TextDisplay;

        // Creates a cell which signifies the root cell
        public Cell()
        {
            this.IsRoot = true;
        }

        // Creates a 1x1 cell of specified grid size at (0,0)
        public Cell(uint grid_size) : this(grid_size, 1, 1, 0, 0)
        {
        }

        // Creates a cell of specified size and grid size at (0,0)
        public Cell(uint grid_size, uint xpos, uint ypos) : this(grid_size, 1, 1, xpos, ypos)
        {
        }

        // Creates a cell of specified size, grid size, and location
        public Cell(uint grid_size, uint width, uint height, uint cell_x_pos, uint cell_y_pos)
        {
            this.GridSize = grid_size;

            this.ID = Guid.NewGuid();

            this.Position = new CellPos(cell_x_pos, cell_y_pos);
            this.Background = new SolidColorBrush(Windows.UI.Colors.Green);

            // This important line allows the cell to capture focus
            this.IsTabStop = true;

            // Add a canvas to the cell
            this.Content = Canvas;
            this.Canvas.Width = width * GridSize;
            this.Canvas.Height = height * GridSize;
            this.Canvas.Background = new SolidColorBrush(Windows.UI.Colors.Transparent);

            // Add a border to the canvas
            this.Border.BorderThickness = new Thickness(2);
            this.Border.BorderBrush = new SolidColorBrush(EveColors.Colors.EveDarkPurple);
            this.Border.Width = this.Canvas.Width;
            this.Border.Height = this.Canvas.Height;
            this.DisableBorder();
            Canvas.SetLeft(Border, 0);
            Canvas.SetTop(Border, 0);
            Canvas.SetZIndex(Border, 1002);
            this.Canvas.Children.Add(this.Border);

            // Add a cell text entry to the canvas
            this.TextEntry = new CellTextEntry(0, 0, GridSize);
            Canvas.SetLeft(this.TextEntry, 0);
            Canvas.SetTop(this.TextEntry, 0);
            Canvas.SetZIndex(this.TextEntry, 1000);
            this.Canvas.Children.Add(this.TextEntry);

            // Add a cell text display to the canvas
            this.TextDisplay = new TextBlock();
            this.TextDisplay.FontSize = GridSize / 1.75;
            this.TextDisplay.FontFamily = new FontFamily("Calibri");
            this.TextDisplay.Foreground = new SolidColorBrush(Windows.UI.Colors.DarkSlateGray);
            this.TextDisplay.Text = "";
            this.TextDisplay.TextAlignment = TextAlignment.Left;
            this.TextDisplay.Padding = new Thickness(GridSize / 3, GridSize / 8, 0, 0);
            this.TextDisplay.SizeChanged += ContentText_SizeChanged;
            Canvas.SetLeft(this.TextDisplay, 0);
            Canvas.SetTop(this.TextDisplay, 0);
            this.Canvas.Children.Add(this.TextDisplay);

            // Add an InkCanvas to the canvas
            /*
            this.InkCanvas = new InkCanvas();
            this.InkCanvas.Width = this.Canvas.Width;
            this.InkCanvas.Height = this.Canvas.Height;
            this.InkCanvas.Visibility = Visibility.Collapsed;
            this.InkCanvas.Loaded += InkCanvas_Loaded;
            this.InkCanvas.InkPresenter.StrokesCollected += InkPresenter_StrokesCollected;
            this.InkCanvas.LostFocus += InkCanvas_LostFocus;
            Canvas.SetLeft(this.InkCanvas, 0);
            Canvas.SetTop(this.InkCanvas, 0);
            this.Canvas.Children.Add(this.InkCanvas);*/

            // Disable text entry by default
            this.DisableTextEntry();

            // Cell Event handlers
            this.Tapped += Cell_Tapped;
            this.DoubleTapped += Cell_DoubleTapped;
            this.RightTapped += Cell_RightTapped;
            this.LostFocus += Cell_LostFocus;
            this.GotFocus += Cell_GotFocus;
            this.KeyDown += Cell_KeyDown;
            this.Loaded += Cell_Loaded;
        }

        private void InkCanvas_LostFocus(object sender, RoutedEventArgs e)
        {
            Debug.WriteLine("Ink Canvas Lost Focus");
        }

        private void InkPresenter_StrokesCollected(Windows.UI.Input.Inking.InkPresenter sender, Windows.UI.Input.Inking.InkStrokesCollectedEventArgs args)
        {
            Debug.WriteLine("Stroke Collected on: " + this.ID);
            this.GrowCell(1);
        }

        private void InkCanvas_Loaded(object sender, RoutedEventArgs e)
        {
            //Debug.WriteLine("InkCanvas Loaded");
        }

        private Cell GetParentCell()
        {
            if (this.Parent != null)
            {
                var parent_name = this.Parent.GetType().Name;

                if (parent_name == "Canvas")
                {
                    var parent_canvas = this.Parent as Canvas;
                    var parent_cell = parent_canvas.Parent as Cell;
                    return parent_cell;
                }
                else
                {
                    return new Cell();
                }
            }
            else
            {
                return new Cell();
            }
        }

        public Cell GetFullscreenCell()
        {
            if (this.IsFullScreen)
            {
                return this;
            }
            else
            {
                return this.GetParentCell().GetFullscreenCell();
            }
        }

        private void Cell_Loaded(object sender, RoutedEventArgs e)
        {
            //Debug.WriteLine("Cell Created: " + this.ID);
            ((Cell)sender).Focus(FocusState.Programmatic);
        }

        private void Cell_KeyDown(object sender, KeyRoutedEventArgs e)
        {
            //Debug.WriteLine("Handling cell: " + this.ID);

            if (!e.Handled)
            {
                // Enter Key
                if (e.Key == Windows.System.VirtualKey.Enter)
                {

                    // Is the control key pressed?
                    var control_pressed = Window.Current.CoreWindow.GetAsyncKeyState(Windows.System.VirtualKey.Control) == Windows.UI.Core.CoreVirtualKeyStates.Down;

                    e.Handled = true;
                    this.DisableCellInput();
                    var parent_cell = this.GetParentCell();
                    // If there is text in the cell, commit it
                    if (this.TextEntry.Text != String.Empty)
                    {
                        this.CommitText(this.TextEntry.Text);
                        if (parent_cell.IsFullScreen)
                        {
                            // If control is pressed, select the current cell
                            if(control_pressed)
                            {
                                parent_cell.SelectCellAtLocation(this.Position.x + this.CellWidth(), this.Position.y);
                            }
                            // If control is not pressed, move cell down
                            else
                            {
                                parent_cell.SelectCellAtLocation(this.Position.x, this.Position.y + 1);
                            }
                        }
                    }
                    // If there is no text entered in the cell, destroy it
                    else
                    {
                        parent_cell.DeselectCell();
                    }
                }
                // Escape
                else if (e.Key == Windows.System.VirtualKey.Escape)
                {
                    this.DisableTextEntry();
                    this.DeselectCell();
                    if (this.IsFullScreen)
                    {
                        e.Handled = true;
                    }
                }

                // This branch assures only the maximized cell can handle them
                if (this.IsFullScreen && this.SelectedCell != null)
                {
                    // Down arrow           
                    if (e.Key == Windows.System.VirtualKey.Down)
                    {
                        e.Handled = true;
                        this.SelectCellAtLocation(this.SelectedCell.Position.x, this.SelectedCell.Position.y + 1);
                    }
                    // Up arrow           
                    else if (e.Key == Windows.System.VirtualKey.Up)
                    {
                        e.Handled = true;
                        if ((int)this.SelectedCell.Position.y - 1 >= 0)
                        {
                            this.SelectCellAtLocation(this.SelectedCell.Position.x, this.SelectedCell.Position.y - 1);
                        }
                    }
                    // Left arrow           
                    else if (e.Key == Windows.System.VirtualKey.Left)
                    {
                        e.Handled = true;
                        if ((int)this.SelectedCell.Position.x - 1 >= 0)
                        {
                            this.SelectCellAtLocation(this.SelectedCell.Position.x - 1, this.SelectedCell.Position.y);
                        }
                    }
                    // Right arrow           
                    else if (e.Key == Windows.System.VirtualKey.Right)
                    {
                        e.Handled = true;
                        this.SelectCellAtLocation(this.SelectedCell.Position.x + this.SelectedCell.CellWidth(), this.SelectedCell.Position.y);
                    }
                    // Delete           
                    else if (e.Key == Windows.System.VirtualKey.Delete)
                    {
                        e.Handled = true;
                        var selected_Cell = this.SelectedCell;
                        this.DeselectCell();
                        this.DeleteCell(selected_Cell);
                    }
                }
            }
        }

        private void Cell_GotFocus(object sender, RoutedEventArgs e)
        {
            //Debug.WriteLine("Cell Got focus: " + this.ID);
            //this.EnableTextEntry();
        }

        private void Cell_LostFocus(object sender, RoutedEventArgs e)
        {
            if (!this.IsFullScreen)
            {
                //this.DisableCell();
            }
        }

        private void Cell_RightTapped(object sender, RightTappedRoutedEventArgs e)
        {
            Debug.WriteLine("Cell ID: " + this.ID);
            Debug.WriteLine("Cell Size: " + this.ActualWidth / this.GridSize + " x " + this.ActualHeight / this.GridSize);
            Debug.WriteLine("Children: " + (this.Canvas.Children.Count - 2));
            Debug.WriteLine("Position: (" + this.Position.x + " , " + this.Position.y + ")");
            Debug.Write("Flow:\n" + this.Flow.ToString());
            if (this.IsFullScreen)
            {
                Debug.WriteLine("======================================================================================================");
            }
            else
            {
                Debug.WriteLine("------------------------------------------------------------------------------------------------------");
            }

            if(!e.Handled)
            {
                Cell cell = sender as Cell;
                var parent_cell = cell.GetParentCell();
                if(parent_cell.IsFullScreen)
                {
                    e.Handled = true;

                    // Uncollapse cells
                    if(cell.Collapsed)
                    {
                        foreach (Cell child in cell.Canvas.Children.Where(child => child.GetType().Name == "Cell"))
                        {
                            if (!child.OutputCell)
                            {
                                child.Visibility = Visibility.Visible;
                            }
                            else
                            {
                                child.GetParentCell().Border.Width = child.GetParentCell().CellWidth() * GridSize;
                                child.GetParentCell().Border.Height = child.GetParentCell().CellHeight() * GridSize;
                                Canvas.SetLeft(child, (child.GetParentCell().CellWidth() - 1) * GridSize);
                                Canvas.SetTop(child, (child.GetParentCell().CellHeight() - 1) * GridSize);
                            }
                        }
                        cell.Collapsed = false;
                    }
                    // Collapse cells
                    else
                    {
                        foreach(Cell child in cell.Canvas.Children.Where(child => child.GetType().Name == "Cell"))
                        {
                            if (!child.OutputCell)
                            {

                                child.Visibility = Visibility.Collapsed;
                            }
                            else
                            {
                                child.GetParentCell().Border.Width = child.CellWidth()*GridSize;
                                child.GetParentCell().Border.Height = child.CellHeight()*GridSize;
                                Canvas.SetLeft(child,0);
                                Canvas.SetTop(child, 0);
                            }
                        }
                        cell.Collapsed = true;
                    }


                }
            }

        }

        private void Cell_Tapped(object sender, TappedRoutedEventArgs e)
        {
            //Debug.WriteLine("TApped with: " + e.PointerDeviceType.ToString());

            // Get the index of the cell which was tapped
            uint x_cell = (uint)Math.Floor(e.GetPosition(this).X / GridSize);
            uint y_cell = (uint)Math.Floor(e.GetPosition(this).Y / GridSize);

            if (!e.Handled)
            {
                if (this.IsFullScreen)
                {
                    e.Handled = true;
                    this.SelectCellAtLocation(x_cell, y_cell);
                }

            }
        }

        private void DeleteCell(Cell cell_to_delete)
        {
            var x_cell = cell_to_delete.Position.x;
            var y_cell = cell_to_delete.Position.y;

            var flow_to_delete = cell_to_delete.Flow;
            
            // Delete these flows
            foreach(var node in flow_to_delete.Network)
            {
                // Update parents
                foreach(var parent in node.Parents)
                {
                    parent.Children.Remove(node);
                    Flow.MarkDirty(parent);
                }

                // Update children
                foreach (var child in node.Children)
                {
                    child.Parents.Remove(node);
                    Flow.MarkDirty(child);
                }

                // Delete the flow
                Flow.Network.Remove(node);
            }
            
            // Actually remove the cell from the canvas
            this.Canvas.Children.Remove(cell_to_delete);

            // Add a blank cell where the deleted cell was
            var added_cell = this.AddCell(1, 1, x_cell, y_cell, null, false);
            added_cell.EnableTextEntry();
            this.SelectCell(added_cell);

            // Recompute flow
            Flow.Compute();
        }

        private void SelectCellAtLocation(uint x_cell, uint y_cell)
        {
            // Get the cell at the desired location
            var cell_at_xy = this.GetCell(x_cell, y_cell);

            // If there is a cell at xy, then select it
            if (cell_at_xy != null)
            {
                this.DeselectCell();
                this.SelectCell(cell_at_xy);
            }
            // If no cell exists at the clicked location, create it
            else
            {
                // If there is no cell selected or a filled cell is selected, just create a new cell
                if (this.SelectedCell == null || this.SelectedCell.Filled)
                {
                    var added_cell = this.AddCell(1, 1, x_cell, y_cell, null, false);
                    this.SelectCell(added_cell);
                    added_cell.EnableTextEntry();
                }
                // If the selected cell cell is not full, move it to the new location 
                else
                {
                    this.SelectedCell.SetPos(x_cell, y_cell);
                    this.SelectedCell.EnableTextEntry();
                }
            }
        }

        private Cell GetCell(uint x_cell, uint y_cell)
        {
            return this.GetChildCells().Find(cell => (cell.Position.x <= x_cell && cell.Position.x + cell.CellWidth() > x_cell) &&
                                                     (cell.Position.y <= y_cell && cell.Position.y + cell.CellHeight() > y_cell));
        }

        // Double tapping will enter a cell for editing
        private void Cell_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
        {
            if (!e.Handled)
            {
                e.Handled = true;

                var double_tapped_cell = sender as Cell;

                // If the double tapped cell is filled, then we want to edit it
                if (double_tapped_cell.Filled && !double_tapped_cell.OutputCell)
                {
                    // Enable the cell's text entry
                    double_tapped_cell.EnableTextEntry();
                }
            }
        }

        public void DisableCellInput()
        {
            this.DisableInkCanvas();
            this.DisableTextEntry();
            this.DisableBorder();
        }

        public void DisableBorder()
        {
            this.Border.Visibility = Visibility.Collapsed;
        }

        public void EnableBorder()
        {
            this.Border.Visibility = Visibility.Visible;
        }

        public void EnableInkCanvas()
        {
            //this.InkCanvas.Visibility = Visibility.Visible;
            this.EnableBorder();
        }

        public void DisableInkCanvas()
        {
            //this.InkCanvas.Visibility = Visibility.Collapsed;
            this.DisableBorder();
        }

        public void EnableTextEntry()
        {
            this.TextEntry.Disable();
            this.TextEntry.Enable();
            this.EnableBorder();
            this.TextEntry.Text = this.TextDisplay.Text;
            this.TextEntry.SelectionStart = this.TextEntry.Text.Length;
        }

        public void DisableTextEntry()
        {
            this.TextEntry.Enable();
            this.TextEntry.Disable();
            this.DisableBorder();
        }

        public void Reset()
        {
            this.Canvas.Width = GridSize;
            this.Canvas.Height = GridSize;
            this.TextEntry.MinWidth = GridSize;
            this.TextEntry.MinHeight = GridSize;
            this.TextEntry.Text = String.Empty;
            //this.InkCanvas.Width = GridSize;
            ///this.InkCanvas.Height = GridSize;
            this.Border.Width = GridSize;
            this.Border.Height = GridSize;
            this.Filled = false;
            this.SelectedCell = null;
        }

        public uint CellWidth()
        {
            return (uint)this.Canvas.Width / GridSize;
        }

        public uint CellHeight()
        {
            return (uint)this.Canvas.Height / GridSize;
        }

        // Setting the size may cause other cells to shift
        // So we have to update the position of other cells as well
        // Could have a chain reaction
        public void SetSize(uint width, uint height)
        {
            this.Canvas.Width = width * GridSize;
            this.Canvas.Height = height * GridSize;
        }

        public List<Cell> GetChildCells()
        {
            return this.Canvas.Children.OfType<Cell>().ToList();
        }

        public void SetPos(uint x, uint y)
        {
            this.Position.x = x;
            this.Position.y = y;
            Canvas.SetLeft(this, x * GridSize);
            Canvas.SetTop(this, y * GridSize);
        }

        public void GrowCell(uint dx)
        {
            //Debug.WriteLine("Growing Cell " + this.ID + " by " + dx);
            var parent_cell = this.GetParentCell();

            this.Canvas.Width = this.Canvas.Width + dx * GridSize;
            this.Border.Width = this.Canvas.Width;
            //this.InkCanvas.Width = this.Canvas.Width;
            this.TextEntry.Width = this.Canvas.Width;

            // Grow the parent cells as well if they aren't large enough
            if (!parent_cell.IsRoot)
            {
                if (this.CellWidth() - parent_cell.CellWidth() > 0)
                {
                    this.GetParentCell().GrowCell(dx);
                }
            }

            // Move any cells that got overlayed by the growth
            var child_cells = parent_cell.GetChildCells();
            if (child_cells.Count > 0)
            {
                // cells to the right on the same line
                var cells_to_right = child_cells.FindAll(cell => (cell != this &&                         // Not this cell
                                                                  cell.Position.y == this.Position.y &&   // The same row as this cell
                                                                  cell.Position.x > this.Position.x));    // To the right of the start of this cell

                // Find intersecting cells
                var intersecting_cells = cells_to_right.FindAll(cell => cell.Position.x < (this.Position.x + this.CellWidth())); // To the left of the end of this cell

                // If there are any interesecting cells, move all cells to the right by the overlap amount
                if (intersecting_cells.Count > 0)
                {
                    foreach (var cell in cells_to_right)
                    {
                        cell.SetPos(cell.Position.x + dx, cell.Position.y);
                        // If the cell is moved past the parent's boundaries, grow it
                        if (cell.Position.x > (parent_cell.CellWidth() - 1))
                        {
                            parent_cell.GrowCell(cell.Position.x - parent_cell.CellWidth() + 1);
                        }
                    }
                }
            }
        }

        public void ShrinkCell(uint dx, uint dy)
        {
            this.Canvas.Width = this.Canvas.Width - dx * GridSize;
            this.Canvas.Height = this.Canvas.Height - dy * GridSize;
            this.Border.Width = this.Canvas.Width;
            this.Border.Height = this.Canvas.Height;
        }

        public void SetFlow(DataflowNetwork flow)
        {
            // Add this flow to this cell
            this.Flow.AddFlow(flow);

            // Add this flow to the parent's flow
            var parent_cell = this.GetParentCell();
            if (!parent_cell.IsRoot)
            {
                //Debug.WriteLine("Adding flow to parent " + parent_cell.ID + ":\n" + this.Flow);
                parent_cell.SetFlow(this.Flow);
            }
        }

        private Cell FindCell(Guid ID)
        {
            foreach (var child in this.Canvas.Children)
            {
                if (child.GetType().Name == "Cell")
                {
                    Cell cell = child as Cell;
                    if (cell.ID == ID)
                    {
                        return cell;
                    }
                }
            }
            return new Cell(25);
        }

        // Set content of a cell based on the input type
        public void SetContent(object content)
        {
            // Set content based on the type
            switch (content.GetType().Name)
            {
                // If it's a string, parse it and add each token to the cell
                case "String":
                    {
                        var parse_result = this.Parser.Parse(content as string);
                        if (parse_result.Good)
                        {
                            // Create a dataflow network from the parse result
                            var flow = new DataflowNetwork(parse_result);

                            // Add each of the parsed tokens to the cell                      
                            uint i = 0;
                            this.ShrinkCell(1, 0);
                            foreach (var token in parse_result.Tokens)
                            {
                                var node = flow.Network.Find(n => token.ID == (n.Token as Token).ID);
                                // If the node wasn't found in the network, it probably means it wasn't added
                                // to the AST, meaning it's a superfluous symbol like = or (  
                                if (node != null)
                                {
                                    this.AddCell(1, 1, i, 0, node, false);
                                }
                                else
                                {
                                    this.AddCell(1, 1, i, 0, token, false);
                                }
                                i++;
                            }

                            // If there is output in the newly created flow, add another new cell to display its output
                            var output_node = flow.Network.Find(n => n.IsOutput());
                            if (output_node != null && output_node.Operation != Operation.INTEGER && output_node.Operation != Operation.FLOAT && output_node.Operation != Operation.STRING)
                            {
                                this.AddCell(1, 1, this.CellWidth(), 0, output_node, true);
                            }
                        }
                        break;
                    }
                // If it's a token, add the token to the cell and set the appropriate container to display its value
                case "DataflowNode":
                    {
                        var node = content as DataflowNode;
                        node.DisplayCell.Add(this);
                        this.SetFlow(new DataflowNetwork(node));
                        if (this.OutputCell)
                        {
                            this.Canvas.Background = new SolidColorBrush(EveColors.Colors.EveLightPurple);
                            DisplayContent(node.Output, Windows.UI.Colors.White);
                        }
                        else
                        {
                            DisplayContent(node.Token, Windows.UI.Colors.DarkSlateGray);
                        }
                        break;
                    }
                // If it's a token, set the contents to the token's value
                case "Token":
                    {
                        var token = content as Token;
                        DisplayContent(token, Windows.UI.Colors.DarkSlateGray);
                        break;
                    }
                default:
                    {
                        throw new Exception("Unexpected content type");
                    }
            }

            this.Filled = true;
        }

        public void DisplayContent(Token token, Color color)
        {
            if (token.Type == "~" || token.Type == "B" || token.Type == "C" || token.Type == "S" || token.Type == "T")
            {
                DisplayCanvasContent(token);
            }
            else
            {
                DisplayStringContent(token, color);
            }
        }

        private void DisplayCanvasContent(Token token)
        {
            var canvas_to_display = token.Value as Canvas;
            Canvas.SetLeft(canvas_to_display, 0);
            Canvas.SetTop(canvas_to_display, 0);

            foreach (var child in this.Canvas.Children)
            {
                if(child.GetType().Name == "Canvas")
                {
                    this.Canvas.Children.Remove(child);
                }
            }
            this.Canvas.Children.Add(canvas_to_display);
        }

        private void DisplayStringContent(Token token, Color color)
        {
            this.TextDisplay.Text = Convert.ToString(token.Value);
            this.TextDisplay.Foreground = new SolidColorBrush(color);
            if (token.Type == "$" || token.Type == "\"")
            {
                this.TextDisplay.TextAlignment = TextAlignment.Left;
            }
        }

        private void ContentText_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            var text_block = sender as TextBlock;

            // Resize parents to fit the rendered text
            var parent_cell = (text_block.Parent as Canvas).Parent as Cell;
            var text_cell_width = (uint)Math.Ceiling(text_block.ActualWidth / GridSize);
            if (text_cell_width - parent_cell.CellWidth() > 0)
            {
                parent_cell.GrowCell(text_cell_width - parent_cell.CellWidth());
            }

            // Set the textblock size to the width of the cell
            text_block.Width = text_cell_width * GridSize;

        }

        public void FillWindow()
        {
            this.Canvas.Width = Double.NaN;
            this.Canvas.Height = Double.NaN;
            this.Canvas.Margin = new Thickness(0);
            this.IsFullScreen = true;
            this.DisableCellInput();
            this.Canvas.Background = new SolidColorBrush(Windows.UI.Colors.Transparent);
        }

        private class CellTextEntry : TextBox
        {
            public CellPos Position;
            public uint CellWidth, CellHeight;
            private uint GridSize;

            public CellTextEntry() : this(1, 1, 25)
            {
            }

            public CellTextEntry(uint x_cell, uint y_cell, uint grid_size)
            {
                GridSize = grid_size;
                Position = new CellPos(x_cell, y_cell);
                FontSize = GridSize / 1.75;
                FontFamily = new FontFamily("Calibri");
                CellWidth = 1;
                CellHeight = 1;
                MinHeight = GridSize;
                MinWidth = GridSize;
                Padding = new Thickness(3, 4, 3, 0);
                BorderThickness = new Thickness(0);
                SelectionHighlightColor = new SolidColorBrush(EveColors.Colors.EveMidBlue);

                // Events
                this.Loaded += CellText_Loaded;
                this.TextChanged += CellText_TextChanged;
                this.IsEnabledChanged += CellTextEntry_IsEnabledChanged;
            }

            public void Disable()
            {
                this.IsEnabled = false;
                this.Visibility = Visibility.Collapsed;
            }

            public void Enable()
            {
                this.IsEnabled = true;
                this.Visibility = Visibility.Visible;
            }

            public Cell GetParentCell()
            {
                if (this.Parent == null)
                {
                    return new Cell();
                }
                else
                {
                    return ((Canvas)this.Parent).Parent as Cell;
                }
            }

            // Set keyboard focus to newly loaded texbox
            private void CellText_Loaded(object sender, RoutedEventArgs e)
            {
                /*
                var cell_text_entry = sender as CellTextEntry;
                var parent_cell = ((Canvas)cell_text_entry.Parent).Parent as Cell;
                parent_cell.EnableBorder();
                Canvas.SetLeft(parent_cell.Border, cell_text_entry.Position.x * GridSize);
                Canvas.SetTop(parent_cell.Border, cell_text_entry.Position.y * GridSize);
                parent_cell.Border.Width = GridSize;

                // If there is a textblock in the cell, get its text
                // and set the textbox's text to that value
                foreach (var cell in parent_cell.Canvas.Children)
                {
                    if (cell.GetType().Name == "TextBlock")
                    {
                        var text_block = cell as TextBlock;
                        var text = text_block.Text;
                        cell_text_entry.Text = text;
                        cell_text_entry.SelectionStart = text.Length;
                        break;
                    }
                }

                //((TextBox)sender).Focus(FocusState.Programmatic);
                */
            }

            private void CellTextEntry_IsEnabledChanged(object sender, DependencyPropertyChangedEventArgs e)
            {
                if ((bool)e.NewValue == true)
                {
                    var cell_text_entry = sender as CellTextEntry;
                    cell_text_entry.Focus(FocusState.Programmatic);
                }
            }

            // On cell overflow, resize the textbox to fill another grid.
            private void CellText_TextChanged(object sender, TextChangedEventArgs e)
            {
                CellTextEntry cell_text_entry = sender as CellTextEntry;

                cell_text_entry.CellWidth = (uint)Math.Ceiling(cell_text_entry.ActualWidth / GridSize);
                cell_text_entry.MinWidth = cell_text_entry.CellWidth * GridSize;

                // Change the size of the border
                var parent_cell = cell_text_entry.GetParentCell();
                parent_cell.Border.Width = cell_text_entry.MinWidth;
            }
        }

        public void SelectCell(Cell cell)
        {
            // Deselect the previous cell
            this.DeselectCell();

            // Select the current cell
            //cell.Border.Width = cell.Canvas.Width;
            //cell.Border.Height = cell.Canvas.Height;
            cell.EnableBorder();

            this.SelectedCell = cell;
        }

        public void DeselectCell()
        {
            if (this.SelectedCell != null)
            {
                this.SelectedCell.DisableBorder();
                this.SelectedCell.DisableCellInput();
                if (!this.SelectedCell.Filled)
                {
                    this.Canvas.Children.Remove(this.SelectedCell);
                }
            }
            this.SelectedCell = null;
        }

        private void CommitText(string text)
        {

            // If the parent cell is filled, update the contents
            if (this.Filled)
            {
                var new_node = Parser.Parse(text);
                // If the parse result is good, do some work with it
                if (new_node.Good)
                {
                    var old_node = this.Flow.Network[0];

                    // Update the graph with a new token
                    this.Flow.Update(old_node, new_node.Tokens[0]);
                }
                // If the result is bad, throw away the new text and keep the old
                // TODO maybe alert the user and give an opportunity to fix it
                else
                {

                }
            }
            // If the parent cell is empty, create a brand new cell
            else
            {
                this.SetContent(text);
            }
        }

        private Cell AddCell(uint width, uint height, uint cell_x_pos, uint cell_y_pos, object content, bool output_flag)
        {
            //Debug.WriteLine("Adding cell");

            // Create a new cell to add at position (x,y)
            var cell_to_add = new Cell(GridSize, width, height, cell_x_pos, cell_y_pos);
            cell_to_add.OutputCell = output_flag;

            // @HACK If the cell is an output cell, put it at the bottom of the render stack
            // Fixes the case where the output cell occluded textboxes       
            if (output_flag)
            {
                Canvas.SetZIndex(cell_to_add, -99);
            }
            //Debug.WriteLine("Adding cell at " + cell_x_pos + ", " + cell_y_pos);
            Canvas.SetLeft(cell_to_add, cell_x_pos * GridSize);
            Canvas.SetTop(cell_to_add, cell_y_pos * GridSize);
            this.Canvas.Children.Add(cell_to_add);
            this.GrowCell(width);

            // If there is no content set, enable text entry
            if (content == null)
            {
                return cell_to_add;
            }
            else
            {
                // This is where the magic happens.
                cell_to_add.SetContent(content);
                return cell_to_add;
            }
        }
    }

    public struct CellPos
    {
        public uint x, y;
        public CellPos(uint x, uint y)
        {
            this.x = x;
            this.y = y;
        }
    }

    public class Token
    {
        public Guid ID = Guid.NewGuid();
        public string Type;
        public object Value;

        public Token()
        {
            this.Type = "Empty";
            this.Value = "?";
        }

        public Token(string type, object value)
        {
            this.Type = type;
            this.Value = value;
        }

        public bool IsDefault()
        {
            if (this.Type == "")
            {
                return true;
            }
            return false;
        }

        public bool IsNumeric()
        {
            if (this.Type == "#" || this.Type == ".")
            {
                return true;
            }
            return false;
        }

        public bool IsArray()
        {
            if (this.Type.Substring(0,1) == "[")
            {
                return true;
            }
            return false;
        }

        public bool IsSet()
        {
            if (this.Type.Substring(0, 1) == "{")
            {
                return true;
            }
            return false;
        }

        public bool IsEnd()
        {
            if (this.Type == "end")
            {
                return true;
            }
            return false;
        }

        public double GetDouble()
        {
            return Convert.ToDouble(this.Value);
        }

        public Int32 GetInteger()
        {
            return Convert.ToInt32(this.Value);
        }

        public String GetString()
        {
            return this.Value as String;
        }

        public List<Token> GetTokenList()
        {
           return (this.Value as ObjectList).Cast<Token>().ToList();
        }

        public TokenSet GetTokenSet()
        {
            return this.Value as TokenSet;
        }

        public override string ToString()
        {
            return "(" + this.Type + "," + this.Value + ")";
        }
    }

    public class TokenList : List<Token>
    {

        public TokenList()
        {

        }

        public TokenList(TokenList tokens)
        {
            foreach (var token in tokens)
            {
                this.Add(token);
            }
        }

        public TokenList(Token token)
        {
            this.Add(token);
        }

        public void Consume()
        {
            this.RemoveAt(0);
        }

        // Returns the next token. If there are no more tokens
        // then return a special "end" token to signify the
        // list is empty
        public Token GetNextToken()
        {
            if (this.Count == 0)
            {
                return new Token("end", "end");
            }
            return this.ElementAt(0);
        }

        public bool IsEmpty()
        {
            if (this.Count > 0)
            {
                return false;
            }
            return true;
        }

        public override string ToString()
        {
            string token_string = "";
            foreach (Token token in this)
            {
                token_string += " " + token;
            }
            return token_string;
        }
    }

    public static class StringExtensionMethods
    {
        public static string ReplaceFirst(this string text, string search, string replace)
        {
            int pos = text.IndexOf(search);
            if (pos < 0)
            {
                return text;
            }
            return text.Substring(0, pos) + replace + text.Substring(pos + search.Length);
        }
    }

    // Mainly for the display of objects in a list
    public class ObjectList : List<object>
    {
        public ObjectList()
        {

        }

        public ObjectList(List<Token> list)
        {
            foreach (var item in list)
            {
                this.Add(item);
            }
        }

        public ObjectList(List<object> list)
        {
            foreach(var item in list)
            {
                this.Add(item);
            }
        }
        
        public override string ToString()
        {
            string return_string = "[";

            int i = 0;
            foreach (var obj in this)
            {
                return_string += " " + Convert.ToString((obj as Token).Value) + ", ";
                i++;
                if(i > 10)
                {
                    return_string += "...";
                    break;
                }
            }
            return_string += " ]";

            return return_string;
        }
    }

    // Mainly for the display of objects in a set
    public class TokenSet
    {
        public HashSet<Token> Set;

        public TokenSet()
        {
            this.Set = new HashSet<Token>(new TokenComparer());
        }

        public TokenSet(HashSet<Token> set)
        {
            this.Set = new HashSet<Token>(new TokenComparer());

            foreach (var item in set)
            {
                this.Set.Add(item);
            }
        }

        public void Add(Token token)
        {
            this.Set.Add(token);
        }

        public TokenSet Union(TokenSet token_set)
        {
            var union = Set.Union(token_set.Set, new TokenComparer());
            return new TokenSet(new HashSet<Token>(union));
        }

        public TokenSet Intersect(TokenSet token_set)
        {
            var intersection = Set.Intersect(token_set.Set, new TokenComparer());
            return new TokenSet(new HashSet<Token>(intersection));
        } 

        public override string ToString()
        {
            string return_string = "{ ";

            foreach (var token in this.Set)
            {
                return_string += Convert.ToString(token.Value) + ", ";
            }

            return_string += "}";

            return return_string;
        }

        class TokenComparer : IEqualityComparer<Token>
        {
            public TokenComparer() { }
            public bool Equals(Token x, Token y)
            {

                bool compare = x.ToString() == y.ToString();
                Debug.WriteLine("Running comparison " + x.ToString() + " vs. " + y.ToString() + " : " + compare);
                return (x.ToString() == y.ToString());
            }

            public int GetHashCode(Token x)
            {
                return x.ToString().GetHashCode();
            }
        }
    }

    public class Lexer
    {
        Regex reserved_word, identifier, string_literal;
        Regex integer, floating_point;
        Regex separator, colon;
        Regex plus_minus_operator, times_divide_operator, exponent_operator, equals_operator;
        Regex o1_bracket, o2_bracket, o3_bracket, c1_bracket, c2_bracket, c3_bracket;

        // @TODO This is a very slow regex lexer. Needs to be replaced with something more efficient
        // @TODO Also does some funny stuff with string replacement and token types being strings. Need to change that.
        public Lexer()
        {
            // Match reserved words
            this.reserved_word = new Regex("end");

            // Match string literals
            this.string_literal = new Regex("\u0022.+\u0022");

            // Match identifiers
            this.identifier = new Regex(@"([a-z]|[A-Z])([a-z]|[A-Z]|[0-9]|_)*");

            // Match separators
            this.separator = new Regex(",");
            this.colon = new Regex(":");

            // Match numbers
            string digit_excluding_zero_pattern = @"([1-9])";
            string digit_pattern = "(0 |" + digit_excluding_zero_pattern + ")";
            string natural_number_pattern = "(((" + digit_excluding_zero_pattern + ")([0-9]*))|" + digit_excluding_zero_pattern + ")";
            string integer_pattern = "(0|" + natural_number_pattern + ")";
            string float_pattern = "((0|" + natural_number_pattern + @")\.[0-9]+)";
            this.integer = new Regex(integer_pattern);
            this.floating_point = new Regex(float_pattern);

            // Match math operators
            this.plus_minus_operator = new Regex(@"(\+|\-)");
            this.times_divide_operator = new Regex(@"(\*|\/)");
            this.exponent_operator = new Regex(@"\^");
            this.equals_operator = new Regex(@"=");

            // Match brackets
            this.o1_bracket = new Regex(@"\(");
            this.o2_bracket = new Regex(@"\[");
            this.o3_bracket = new Regex(@"\{");
            this.c1_bracket = new Regex(@"\)");
            this.c2_bracket = new Regex(@"\]");
            this.c3_bracket = new Regex(@"\}");
        }

        private TokenList MatchAndReplace(Regex regex, ref string input, string replace)
        {
            MatchCollection matches = regex.Matches(input);
            TokenList matched_tokens = new TokenList();
            foreach (Match match in matches)
            {
                input = input.ReplaceFirst(match.Value, replace);
                matched_tokens.Add(new Token(replace, match.Value));
            }
            return matched_tokens;
        }

        public TokenList Lex(string input)
        {
            List<Token> matched_tokens = new TokenList();
            string matched_input = input;

            // Match protected words
            matched_tokens.AddRange(MatchAndReplace(reserved_word, ref matched_input, "&"));

            // Match string literals
            matched_tokens.AddRange(MatchAndReplace(string_literal, ref matched_input, "\""));

            // Match identifiers
            matched_tokens.AddRange(MatchAndReplace(identifier, ref matched_input, "$"));

            // Match separators
            matched_tokens.AddRange(MatchAndReplace(separator, ref matched_input, ","));
            matched_tokens.AddRange(MatchAndReplace(colon, ref matched_input, ":"));

            // Match operators
            matched_tokens.AddRange(MatchAndReplace(plus_minus_operator, ref matched_input, "+"));
            matched_tokens.AddRange(MatchAndReplace(times_divide_operator, ref matched_input, "*"));
            matched_tokens.AddRange(MatchAndReplace(exponent_operator, ref matched_input, "^"));
            matched_tokens.AddRange(MatchAndReplace(equals_operator, ref matched_input, "="));

            // Match brackets
            // ()
            matched_tokens.AddRange(MatchAndReplace(o1_bracket, ref matched_input, "("));
            matched_tokens.AddRange(MatchAndReplace(c1_bracket, ref matched_input, ")"));
            // []
            matched_tokens.AddRange(MatchAndReplace(o2_bracket, ref matched_input, "["));
            matched_tokens.AddRange(MatchAndReplace(c2_bracket, ref matched_input, "]"));
            // {}
            matched_tokens.AddRange(MatchAndReplace(o3_bracket, ref matched_input, "{"));
            matched_tokens.AddRange(MatchAndReplace(c3_bracket, ref matched_input, "}"));

            // Match numbers
            matched_tokens.AddRange(MatchAndReplace(floating_point, ref matched_input, "."));
            matched_tokens.AddRange(MatchAndReplace(integer, ref matched_input, "#"));

            // Remove whitespace
            matched_input = matched_input.Replace(" ", "");

            // If any characters in matched_input have not been tokenized,
            // return the input as a string literal
            if (matched_input.Length != matched_tokens.Count)
            {
                Debug.WriteLine("Input recognized as string literal");
                //Debug.WriteLine(matched_input);
                //Debug.WriteLine(matched_tokens.ToString());
                return new TokenList(new Token("\"", input));
            }

            // Reorder the matched tokens. Each character in the modified input string
            // corresponds to a token we've previously matched.
            TokenList reordered_tokens = new TokenList();
            foreach (char topchar in matched_input.ToCharArray())
            {
                // Find the first token matching topchar
                var top_token = matched_tokens.Find(token => token.Type == topchar.ToString());

                // Add the token to the reordered list
                reordered_tokens.Add(top_token);

                // Remove token from the matched token list
                matched_tokens.Remove(top_token);
            }

            Debug.WriteLine("Lex Complete!");
            return reordered_tokens;
        }
    }

    public class Tree<T>
    {
        public Guid ID = Guid.NewGuid();
        public T Content;
        public List<Tree<T>> Children;
        public Tree<T> Parent = null;
        public int Size;
        public bool Empty;

        public Tree()
        {
            this.Content = default(T);
            this.Children = new List<Tree<T>>();
            this.Empty = true;
            this.Size = 0;
        }

        public Tree(T content)
        {
            this.Content = content;
            this.Children = new List<Tree<T>>();
            this.Empty = false;
            this.Size = 1;
        }

        public void SetContent(T content)
        {
            this.Content = content;
            this.Empty = false;
        }

        private void IncreaseSize(int size)
        {
            this.Size += size;
            if (this.Parent != null)
            {
                this.Parent.IncreaseSize(size);
            }
        }

        public void AddChildNode(Tree<T> child_node)
        {
            child_node.Parent = this;
            this.IncreaseSize(child_node.Size);
            this.Children.Add(child_node);
            this.Empty = false;
        }

        public void AddChild(T child)
        {
            this.AddChildNode(new Tree<T>(child));
        }

        public int GetDepth()
        {
            int depth = 0;
            if (this.Parent == null)
            {
                return depth;
            } else
            {
                return this.Parent.GetDepth() + 1;
            }
        }

        public override string ToString()
        {
            if (this.Empty)
            {
                return "Empty";
            }

            // print the content and then the content of the children
            string to_string = "|" + this.Content.ToString() + "\n";

            foreach (var node in this.Children)
            {
                string indent = new string('-', node.GetDepth());
                to_string += "|" + indent + node.ToString();
            }

            return to_string;
        }
    }

    public struct ParseResult
    {
        public AST AST;
        public TokenList Tokens;
        public bool Good;
    }

    public class Parser
    {
        private Lexer lexer = new Lexer();

        public ParseResult Parse(string input)
        {
            Debug.WriteLine("Parsing...");
            var parse_result = new ParseResult();

            TokenList lex_result = lexer.Lex(input);
            parse_result.Tokens = lex_result;

            TokenList tokens_out;
            var ast = Expression(lex_result, out tokens_out);
            parse_result.AST = ast;

            // If we haven't consumed all the tokens, then the parse failed
            if (tokens_out.Count != 0)
            {
                Debug.WriteLine(tokens_out.ToString());
                Debug.WriteLine(ast.ToString());
                Debug.WriteLine("Parsing failed :(");
                parse_result.Tokens = tokens_out;
                parse_result.Good = false;
                return parse_result;
            }

            parse_result.Good = true;
            Debug.WriteLine("Parsing succeeded! :D");

            // If we've gotten here, everything was a success!
            return parse_result;
        }

        // If the test passes, the token is consumed. If not,
        // the token list remains the same
        private AST TokenTest(TokenList tokens_in, out TokenList tokens_out, string test)
        {
            tokens_out = new TokenList(tokens_in);
            Token next = tokens_out.GetNextToken();

            if (next.Type == test)
            {
                tokens_out.Consume();
                return new AST(next);
            }
            tokens_out = new TokenList(tokens_in);
            return new AST();
        }

        private AST OrCom(List<Rule> rules, TokenList tokens_in, out TokenList tokens_out)
        {
            tokens_out = new TokenList(tokens_in);

            foreach (var rule in rules)
            {
                var ast = rule(tokens_out, out tokens_out);
                if (!ast.Empty)
                {
                    return ast;
                }
            }

            tokens_out = new TokenList(tokens_in);
            return new AST();
        }

        public delegate AST Rule(TokenList tokens_in, out TokenList tokens_out);

        // An expression can be one of:
        //   - A string literal
        //   - An identifier
        //   - A number
        //   - A math expression
        //   - An expression
        private AST Expression(TokenList tokens_in, out TokenList tokens_out)
        {
            //Debug.WriteLine("Expression");

            var rules = new List<Rule>();
            rules.Add(new Rule(ReservedWord));
            rules.Add(new Rule(Assignment));
            rules.Add(new Rule(Range));
            rules.Add(new Rule(MathExpression));
            rules.Add(new Rule(String));
            rules.Add(new Rule(Identifier));
            rules.Add(new Rule(Number));
            rules.Add(new Rule(CellArray));
            rules.Add(new Rule(CellSet));

            return OrCom(rules, tokens_in, out tokens_out);
        }

        private AST CellArray(TokenList tokens_in, out TokenList tokens_out)
        {
            tokens_out = new TokenList(tokens_in);
            var next = tokens_out.GetNextToken();
            var ast = new AST();
            if (!OBracket(tokens_out, out tokens_out).Empty)
            {
                ast = new AST(next);
                // Gobble up the numbers
                var array_element = new AST();
                do
                {
                    array_element = Expression(tokens_out, out tokens_out);
                    if (!array_element.Empty)
                    {
                        ast.AddChildNode(array_element);
                    }
                } while (!array_element.Empty);

                // Finally, we need a closing bracket
                if(!CBracket(tokens_out, out tokens_out).Empty)
                {
                    return ast;
                }
            }
            tokens_out = new TokenList(tokens_in);
            return ast;
        }

        private AST Range(TokenList tokens_in, out TokenList tokens_out)
        {
            tokens_out = new TokenList(tokens_in);
            var next = tokens_out.GetNextToken();
            var ast = new AST(new Token(":",":"));

            // Get a number
            if (!Number(tokens_out, out tokens_out).Empty)
            {
                ast.AddChild(next);

                // Get a colon
                if (!Colon(tokens_out, out tokens_out).Empty)
                {
                    next = tokens_out.GetNextToken();
                    // Get another number
                    if (!Number(tokens_out, out tokens_out).Empty)
                    {
                        ast.AddChild(next);
                        // Get another token
                        if (!Colon(tokens_out, out tokens_out).Empty)
                        {
                            next = tokens_out.GetNextToken();
                            // Get a final number
                            if (!Number(tokens_out, out tokens_out).Empty)
                            {
                                ast.AddChild(next);
                                return ast;
                            }
                        }
                    }
                }
            }
            tokens_out = new TokenList(tokens_in);
            return new AST();
        }

        private AST CellSet(TokenList tokens_in, out TokenList tokens_out)
        {
            tokens_out = new TokenList(tokens_in);
            var next = tokens_out.GetNextToken();
            var ast = new AST();
            if (!OCurlyBracket(tokens_out, out tokens_out).Empty)
            {
                ast = new AST(next);
                // Gobble up the numbers
                var array_element = new AST();
                do
                {
                    array_element = Expression(tokens_out, out tokens_out);
                    if (!array_element.Empty)
                    {
                        ast.AddChildNode(array_element);
                    }
                } while (!array_element.Empty);

                // Finally, we need a closing bracket
                if (!CCurlyBracket(tokens_out, out tokens_out).Empty)
                {
                    return ast;
                }
            }
            tokens_out = new TokenList(tokens_in);
            return ast;
        }

        private AST Assignment(TokenList tokens_in, out TokenList tokens_out)
        {
            //Debug.WriteLine("Assignment: " + tokens_in.ToString());
            tokens_out = new TokenList(tokens_in);

            var next = tokens_out.GetNextToken();
            var ast = new AST();
            // Test for an identifier
            if (!Identifier(tokens_out, out tokens_out).Empty)
            {
                ast = new AST(next);
                // Test for an equals sign
                if (!Equals(tokens_out, out tokens_out).Empty)
                {
                    // Test for an expression
                    var math_ast = Expression(tokens_out, out tokens_out);
                    if (!math_ast.Empty)
                    {
                        ast.AddChildNode(math_ast);
                        return ast;
                    }
                }
            }
            tokens_out = new TokenList(tokens_in);
            return new AST();
        }

        // A number is an integer or a float
        private AST Number(TokenList tokens_in, out TokenList tokens_out)
        {
            var rules = new List<Rule>();
            rules.Add(new Rule(Integer));
            rules.Add(new Rule(Float));

            return OrCom(rules, tokens_in, out tokens_out);
        }

        private AST Identifier(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "$");
        }

        private AST Colon(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, ":");
        }

        private AST Integer(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "#");
        }

        private AST Separator(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, ",");
        }

        private AST Float(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, ".");
        }

        private AST ReservedWord(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "&");
        }

        private AST PlusMinus(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "+");
        }

        private AST MulDiv(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "*");
        }

        private AST Exponent(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "^");
        }

        private AST String(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "\"");
        }

        private AST OParen(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "(");
        }

        private AST CParen(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, ")");
        }

        private AST OBracket(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "[");
        }

        private AST CBracket(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "]");
        }

        private AST OCurlyBracket(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "{");
        }

        private AST CCurlyBracket(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "}");
        }

        private AST Equals(TokenList tokens_in, out TokenList tokens_out)
        {
            return TokenTest(tokens_in, out tokens_out, "=");
        }

        // A math expression consists of math followed by = and an optional identifier
        private AST MathExpression(TokenList tokens_in, out TokenList tokens_out)
        {
            //Debug.WriteLine("Math Expresion: " + tokens_in.ToString());
            tokens_out = new TokenList(tokens_in);

            var math_ast = MathParserL1(tokens_out, out tokens_out);

            // Check for equals
            if (!Equals(tokens_out, out tokens_out).Empty)
            {
                var identifier = Identifier(tokens_out, out tokens_out);
                // Check for an identifier
                if (!identifier.Empty)
                {
                    identifier.AddChildNode(math_ast);
                    return identifier;
                }
            }

            // If the ast is empty, then the math parse failed. 
            // Return the input token list
            if (math_ast.Empty)
            {
                tokens_out = new TokenList(tokens_in);
            }
            return math_ast;
        }

        private AST MakeNode(AST op, AST lhs, AST rhs)
        {
            op.AddChildNode(lhs);
            op.AddChildNode(rhs);
            return op;
        }

        // Level 1 handles + and - operators
        private AST MathParserL1(TokenList tokens_in, out TokenList tokens_out)
        {
            //Debug.WriteLine("Math Expresion L1: " + tokens_in.ToString());
            tokens_out = new TokenList(tokens_in);

            var op = new AST();
            var lhs = MathParserL2(tokens_out, out tokens_out);
            var next = tokens_out.GetNextToken();
            while (!PlusMinus(tokens_out, out tokens_out).Empty)
            {
                op = new AST(next);
                var rhs = MathParserL2(tokens_out, out tokens_out);
                op.AddChildNode(lhs);
                op.AddChildNode(rhs);
                lhs = op;

                next = tokens_out.GetNextToken();
            }

            if (lhs.Empty)
            {
                tokens_out = new TokenList(tokens_in);
            }
            return lhs;
        }

        // Level 2 handles * and / operators
        private AST MathParserL2(TokenList tokens_in, out TokenList tokens_out)
        {
            //Debug.WriteLine("Math Expresion L2: " + tokens_in.ToString());
            tokens_out = new TokenList(tokens_in);

            var op = new AST();
            var lhs = MathParserL3(tokens_out, out tokens_out);
            var next = tokens_out.GetNextToken();
            while (!MulDiv(tokens_out, out tokens_out).Empty)
            {
                op = new AST(next);
                var rhs = MathParserL3(tokens_out, out tokens_out);
                op.AddChildNode(lhs);
                op.AddChildNode(rhs);
                lhs = op;
                next = tokens_out.GetNextToken();
            }

            if (lhs.Empty)
            {
                tokens_out = new TokenList(tokens_in);
            }
            return lhs;
        }

        // Level 3 handles ^ operator
        private AST MathParserL3(TokenList tokens_in, out TokenList tokens_out)
        {
            //Debug.WriteLine("Math Expresion L3: " + tokens_in.ToString());
            tokens_out = new TokenList(tokens_in);

            var lhs = MathParserL4(tokens_out, out tokens_out);

            var next = tokens_out.GetNextToken();
            if (!Exponent(tokens_out, out tokens_out).Empty)
            {
                var op = new AST(next);
                var rhs = MathParserL4(tokens_out, out tokens_out);
                op.AddChildNode(lhs);
                op.AddChildNode(rhs);
                lhs = op;
            }

            if (lhs.Empty)
            {
                tokens_out = new TokenList(tokens_in);
            }
            return lhs;
        }

        // Level 4 handles terminals, separators, urnary operators, functions, etc.
        private AST MathParserL4(TokenList tokens_in, out TokenList tokens_out)
        {
            //Debug.WriteLine("Math Expresion L4: " + tokens_in.ToString());
            tokens_out = new TokenList(tokens_in);

            var rules = new List<Rule>();
            rules.Add(new Rule(Number));
            rules.Add(new Rule(Function));
            rules.Add(new Rule(Identifier));
            rules.Add(new Rule(MathParserL5));

            return OrCom(rules, tokens_out, out tokens_out);

            // Next token is a function identifier
            // Next token is a urnary operator
        }

        // Level 5 handles parenthetical expressions
        private AST MathParserL5(TokenList tokens_in, out TokenList tokens_out)
        {
            //Debug.WriteLine("Math Expresion L5: " + tokens_in.ToString());
            tokens_out = new TokenList(tokens_in);

            var ast = new AST();
            if (!OParen(tokens_out, out tokens_out).Empty)
            {
                ast = MathParserL1(tokens_out, out tokens_out);
                if (CParen(tokens_out, out tokens_out).Empty)
                {
                    tokens_out = new TokenList(tokens_in);
                    return new AST();
                }
            }
            return ast;
        }

        // Functions are an identifier
        // followed by a (
        // followed by a comma separated list of expressions
        private AST Function(TokenList tokens_in, out TokenList tokens_out)
        {
            tokens_out = new TokenList(tokens_in);
            var ast = new AST();

            // Test the identifier
            var function_node = Identifier(tokens_out, out tokens_out);
            if (function_node.Empty)
            {
                tokens_out = new TokenList(tokens_in);
                return new AST();
            }

            // Test for a Oparen
            if (OParen(tokens_out, out tokens_out).Empty)
            {
                tokens_out = new TokenList(tokens_in);
                return new AST();
            }

            // Replace the type with a function identifier
            function_node.Content.Type = "@";
            ast = function_node;

            // Test for at least one expression
            do
            {
                var expression = Expression(tokens_out, out tokens_out);

                // Add the expression to the arguments of the function
                if(!expression.Empty)
                {
                    ast.AddChildNode(expression);
                }

            } while(!Separator(tokens_out, out tokens_out).Empty); // Consume a separator if there is one

            // Test for a Cparen
            if (CParen(tokens_out, out tokens_out).Empty)
            {
                tokens_out = new TokenList(tokens_in);
                return new AST();
            }

            return ast;
        }
    }

    public enum Operation
    {
        // Base types
        STRING,
        FLOAT,
        INTEGER,
        ARRAY,
        SET,
        IDENTIFIER,
        // Binary operations
        ADD,
        SUBTRACT,
        MULTIPLY,
        DIVIDE,
        EXPONENTIATE,
        // Aggregate operations
        SUM,
        MAX,
        MIN,
        MEAN,
        MEDIAN,
        MODE,
        STDEV,
        // Set Operations
        UNION,
        JOIN,
        INTERSECT,
        GROUP,
        SORTASC,
        SORTDESC,
        LIMIT,
        RANGE,
        // Trig functions
        SIN,
        COS,
        // Special functions
        COUNTER,
        GRAPH,
        BUTTON,
        TEXTBOX,
        SUBMIT,
        COMBOBOX,
        NONE,
        ERR
    };

    public static class OperationExtensions
    {
        public static String ToString(this Operation op)
        {
            switch (op)
            {
                case Operation.FLOAT:
                    return ".";
                case Operation.INTEGER:
                    return "#";
                case Operation.STRING:
                    return "\"";
                case Operation.IDENTIFIER:
                    return "$";
                case Operation.ADD:
                    return "+";
                case Operation.SUBTRACT:
                    return "+";
                case Operation.MULTIPLY:
                    return "*";
                case Operation.DIVIDE:
                    return "*";
                case Operation.EXPONENTIATE:
                    return "^";
                default:
                    return "";
            }
        }
    }

    public static class GuidExtensions
    {
        public static string ToShortString(this Guid ID)
        {
            return ID.ToString().Substring(0, 4);
        }
    }

    public class DataflowNode
    {
        public Guid ID;
        public string Name = "";
        public Operation Operation;
        public Token Token;
        public Token Output= new Token();
        public List<DataflowNode> Parents = new List<DataflowNode>();
        public List<DataflowNode> Children = new List<DataflowNode>();
        public bool Dirty;
        public Color Color = Windows.UI.Colors.Black;
        public List<Cell> DisplayCell = new List<Cell>();
        public object Content;

        public DataflowNode(AST ast)
        {
            this.ID = Guid.NewGuid();
            this.Operation = StringToOperation(ast.Content);
            this.Token = ast.Content;
            this.Dirty = true;
            if (this.Operation == Operation.IDENTIFIER)
            {
                this.Name = ast.Content.Value as String;
            }
        }

        public Operation StringToOperation(Token token)
        {
            switch (token.Type)
            {
                case ".":
                    return Operation.FLOAT;
                case "#":
                    return Operation.INTEGER;
                case "\"":
                    return Operation.STRING;
                case "$":
                    return Operation.IDENTIFIER;
                case "@":
                    if (token.Value as String == "sum")
                    {
                        return Operation.SUM;
                    }
                    else if (token.Value as String == "max")
                    {
                        return Operation.MAX;
                    }
                    else if (token.Value as String == "min")
                    {
                        return Operation.MIN;
                    }
                    else if (token.Value as String == "counter")
                    {
                        return Operation.COUNTER;
                    }
                    else if (token.Value as String == "graph")
                    {
                        return Operation.GRAPH;
                    }
                    else if (token.Value as String == "sin")
                    {
                        return Operation.SIN;
                    }
                    else if (token.Value as String == "cos")
                    {
                        return Operation.COS;
                    }
                    else if (token.Value as String == "limit")
                    {
                        return Operation.LIMIT;
                    }
                    else if (token.Value as String == "sortasc" || token.Value as String == "sort")
                    {
                        return Operation.SORTASC;
                    }
                    else if (token.Value as String == "sortdesc")
                    {
                        return Operation.SORTDESC;
                    }
                    else if (token.Value as String == "mean" || token.Value as String == "avg" || token.Value as String == "average")
                    {
                        return Operation.MEAN;
                    }
                    else if (token.Value as String == "median")
                    {
                        return Operation.MEDIAN;
                    }
                    else if (token.Value as String == "stdev")
                    {
                        return Operation.STDEV;
                    }
                    else if (token.Value as String == "union")
                    {
                        return Operation.UNION;
                    }
                    else if (token.Value as String == "join")
                    {
                        return Operation.JOIN;
                    }
                    else if (token.Value as String == "intersect")
                    {
                        return Operation.INTERSECT;
                    }
                    else if (token.Value as String == "group")
                    {
                        return Operation.GROUP;
                    }
                    else if (token.Value as String == "button")
                    {
                        return Operation.BUTTON;
                    }
                    else if (token.Value as String == "textbox")
                    {
                        return Operation.TEXTBOX;
                    }
                    else if (token.Value as String == "submit")
                    {
                        return Operation.SUBMIT;
                    }
                    else if (token.Value as String == "combobox")
                    {
                        return Operation.COMBOBOX;
                    }
                    break;
                case "+":
                    if (token.Value as String == "+")
                        return Operation.ADD;
                    else if (token.Value as String == "-")
                        return Operation.SUBTRACT;
                    break;
                case "*":
                    if (token.Value as String == "*")
                        return Operation.MULTIPLY;
                    else if (token.Value as String == "/")
                        return Operation.DIVIDE;
                    break;
                case "^":
                    return Operation.EXPONENTIATE;
                case "[":
                    return Operation.ARRAY;
                case "{":
                    return Operation.SET;
                case ":":
                    return Operation.RANGE;
                case "&":
                    break;
                default:
                    return Operation.ERR;
            }
            return Operation.ERR;
        }

        public bool IsConstant()
        {
            if(this.IsUnbound() && (this.Operation == Operation.INTEGER || 
                                    this.Operation == Operation.FLOAT || 
                                    this.Operation == Operation.COUNTER ||
                                    this.Operation == Operation.STRING))
            {
                return true;
            }
            return false;
        }

        public bool IsUnbound()
        {
            if(this.Children.Count == 0)
            {
                return true;
            }
            return false;
        }

        public bool IsBound()
        {
            if (!this.IsUnbound() || IsConstant())
            {
                return true;
            }
            return false;
        }

        public bool IsOutput()
        {
            if (this.Parents.Count == 0)
            {
                return true;
            }
            return false;
        }

        // A node is ready to fire if:
        // 1) it is bound to something
        // 2) all of its children are not dirty
        // 3) the node itsef is dirty
        public bool ReadyToFire()
        {
            var children_ready = this.Children.All(n => n.Dirty == false);

            if (this.IsBound() && children_ready && this.Dirty)
            {
                return true;
            }
            return false;
        }

        public override string ToString()
        {
            string return_string = "";

            var spacer = 12 - this.Operation.ToString().ToList().Count;

            return_string += this.ID.ToShortString() + "\t" + this.Name + "\t" + this.Dirty + "\t" + this.Operation + new string(' ',spacer) + "\t" + this.Token + "\t" + this.Output + "\t";
            if (this.IsOutput())
            {
                return_string += "OUTPUT";
            }
            else
            {
                return_string += "[ ";
                foreach (var parent in this.Parents)
                {
                    return_string += parent.ID.ToShortString() + " ";
                }
                return_string += "]";
            }
            return_string += "\t";

            if (this.IsConstant())
            {
                return_string += "CONSTANT";
            }
            else if (this.IsUnbound())
            {
                return_string += "UNBOUND";
            }
            else
            {
                return_string += "[ ";
                foreach (var child in this.Children)
                {
                    return_string += child.ID.ToShortString() + " ";
                }
                return_string += "]";
            }
            return_string += "\n";
            
            return return_string;
        }
    }

    public class DataflowNetwork
    {
        public List<DataflowNode> Network;

        public DataflowNetwork()
        {
            this.Network = new List<DataflowNode>();
        }

        public DataflowNetwork(DataflowNode node)
        {
            this.Network = new List<DataflowNode>();
            this.Network.Add(node);
            Compute();
        }

        public DataflowNetwork(ParseResult parse_result)
        {
            if(!parse_result.Good)
            {
                this.Network = new List<DataflowNode>();
                return;
            }
            this.Network = FlattenAST(parse_result.AST, null);
            Compute();
        }

        public List<DataflowNode> GetOutput()
        {
            return this.Network.FindAll(node => node.IsOutput());
        }

        public void Update(DataflowNode old_node, Token new_token)
        {
            // Set the new token
            old_node.Token = new_token;

            // Set the new operation
            old_node.Operation = old_node.StringToOperation(new_token);

            // Mark this node and its parents as dirty
            MarkDirty(old_node);

            // Recompute network
            Compute();
        }

        public void MarkDirty(DataflowNode node)
        {
            node.Dirty = true;
            foreach (var n in node.Parents)
            {
                n.Output = new Token("Empty", "?");
                UpdateDisplay(n);
                MarkDirty(n);
            }
        }

        public void AddFlow(DataflowNetwork new_flow)
        {

            //Debug.WriteLine("New Network\n" + new_flow.ToString());
            //Debug.WriteLine("Old Network\n" + this.ToString());

            // Get all the identifiers in old and new networks
            var old_identifiers = this.Network.FindAll(n => n.Operation == Operation.IDENTIFIER);
            var new_identifiers = new_flow.Network.FindAll(n => n.Operation == Operation.IDENTIFIER);

            // Union the two networks together
            this.Network = this.Network.Union(new_flow.Network).ToList();

            // Reroute connections for identifiers
            foreach (var new_identifier in new_identifiers)
            {
                foreach (var old_identifier in old_identifiers)
                {
                    /*
                    if(new_identifier.Name == old_identifier.Name)
                    {
                        Debug.WriteLine(new_identifier.Name + " :" + new_identifier.NodeTag + " -- " + old_identifier.NodeTag);
                        Debug.WriteLine(new_identifier.ChildTags.Count + " -- " + old_identifier.ChildTags.Count);
                    }*/

                    // If the identifier is the same, and one of them is unbound while the other is bound
                    if ((new_identifier.Name == old_identifier.Name) &&               // The identifiers are the same
                        (new_identifier.IsUnbound() ^ old_identifier.IsUnbound()))    // Only one is unbound
                    {
                        Debug.WriteLine("FOUND A MATCH FOR " + new_identifier.Name);
                        
                        // Rerout the children of the unbound node to the the bound node's children
                        // Also reroute the parents
                        if (old_identifier.IsUnbound())
                        {
                            old_identifier.Children = new_identifier.Children;
                            // Identifiers only have one child, so this is safe
                            new_identifier.Children[0].Parents.Add(old_identifier);
                        }
                        else
                        {
                            new_identifier.Children = old_identifier.Children;
                            old_identifier.Children[0].Parents.Add(new_identifier);
                        }
                    }
                }
            }

            // Recompute the network
            Compute();
        }

        public void UpdateDisplay(DataflowNode node)
        {
            foreach (var display_cell in node.DisplayCell)
            {
                if (display_cell.OutputCell)
                {
                    display_cell.DisplayContent(node.Output, Windows.UI.Colors.White);
                }
                else
                {
                    display_cell.DisplayContent(node.Token, Windows.UI.Colors.DarkSlateGray);
                }   
            }
        }

        public void Compute()
        {
            bool changed;            
            do
            {
                changed = false;
                
                foreach (var node in this.Network)
                {
                    if (node.ReadyToFire())
                    {
                        ComputeRecurse(node);
                        changed = true;
                    }   
                }

            } while (changed); // If any node changed from dirty to clean in the previous tick, tick again
        }

        private void ComputeRecurse(DataflowNode node)
        {
            node.Output = FireNode(node);
            node.Dirty = false;
            UpdateDisplay(node);
            foreach(var n in node.Parents)
            {
                if (n.ReadyToFire())
                {
                    ComputeRecurse(n);
                }
            }
        }

        public delegate double BiOp(double lhs, double rhs);
        public delegate double MathOp(double value);

        private Token FireNode(DataflowNode node)
        {
            switch (node.Operation)
            {
                case Operation.STRING:
                    {
                        return new Token("\"", node.Token.Value as String);
                    }
                case Operation.INTEGER:
                    {
                        return new Token("#", Convert.ToInt32(node.Token.Value as String));
                    }
                case Operation.FLOAT:
                    {
                        return new Token(".", Convert.ToDouble(node.Token.Value as String));
                    }
                // This case is for handling all binary math operations
                case Operation.ADD:
                case Operation.SUBTRACT:
                case Operation.MULTIPLY:
                case Operation.DIVIDE:
                case Operation.EXPONENTIATE:
                    {
                        if (node.Children.Count != 2)
                        {
                            return new Token("Err", "Expected 2 arguments, received " + node.Children.Count);
                        }

                        // Set the binary operation
                        BiOp operation;
                        if (node.Operation == Operation.ADD)
                        {
                            operation = (lhs, rhs) => lhs + rhs;
                        }
                        else if (node.Operation == Operation.SUBTRACT)
                        {
                            operation = (lhs, rhs) => lhs - rhs;
                        }
                        else if (node.Operation == Operation.MULTIPLY)
                        {
                            operation = (lhs, rhs) => lhs * rhs;
                        }
                        else if (node.Operation == Operation.DIVIDE)
                        {
                            operation = (lhs, rhs) => lhs / rhs;
                        }
                        else if (node.Operation == Operation.EXPONENTIATE)
                        {
                            operation = (lhs, rhs) => Math.Pow(lhs, rhs);
                        }
                        else
                        {
                            return new Token("Err", "Unknown binary operation: " + node.Operation);
                        }

                        // Set what to do depending on the input types being arrays or scalars
                        if (node.Children[0].Output.IsNumeric() && node.Children[1].Output.IsNumeric())
                        {
                            var lhs = node.Children[0].Output.GetDouble();
                            var rhs = node.Children[1].Output.GetDouble();
                            var result = operation(lhs, rhs);
                            return new Token(".", result);
                        }
                        else if (node.Children[0].Output.IsArray() && node.Children[1].Output.IsNumeric())
                        {
                            var lhs = node.Children[0].Output.GetTokenList();
                            var rhs = node.Children[1].Output.GetDouble();
                            var result = new List<Token>();
                            foreach (var token in lhs)
                            {
                                var calculate = operation(token.GetDouble(), rhs);
                                result.Add(new Token(token.Type, calculate));
                            }
                            return new Token("[.", new ObjectList(result));
                        }
                        else if (node.Children[0].Output.IsNumeric() && node.Children[1].Output.IsArray())
                        {
                            var lhs = node.Children[0].Output.GetDouble();
                            var rhs = node.Children[1].Output.GetTokenList();
                            var result = new List<Token>();
                            foreach (var token in rhs)
                            {
                                var calculate = operation(lhs, token.GetDouble());
                                result.Add(new Token(token.Type, calculate));
                            }
                            return new Token("[.", new ObjectList(result));
                        }
                        else if (node.Children[0].Output.IsArray() && node.Children[1].Output.IsArray())
                        {
                            var lhs = node.Children[0].Output.GetTokenList();
                            var rhs = node.Children[1].Output.GetTokenList();

                            if (rhs.Count != lhs.Count)
                            {
                                return new Token("Err", "LHS and RHS must have same number of elements: lhs- " + lhs.Count + " rhs: " + rhs.Count);
                            }

                            // Zips the two lists, adds the elements pairwise, and makes a new token. The result of this is a list of tokens of the added pairs
                            var result = lhs.Zip(rhs, (a, b) => new Token("#", operation(a.GetDouble(), b.GetDouble()))).ToList<Token>();

                            return new Token("[.", new ObjectList(result));
                        }
                        else
                        {
                            return new Token("Err", "Unknown input format: " + node.Children[0].Output.Type + " & " + node.Children[1].Output.Type);
                        }
                    }
                case Operation.IDENTIFIER:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }

                        var input = node.Children[0].Output;

                        return new Token(input.Type, input.Value);
                    }
                case Operation.ARRAY:
                    {
                        if (node.Children.Count <= 0)
                        {
                            return new Token("Err", "Expected at least 1 argument, received " + node.Children.Count);
                        }

                        var array = new ObjectList();
                        string type = "";
                        foreach (var child in node.Children)
                        {
                            type = child.Output.Type;
                            array.Add(child.Output);
                        }
                        return new Token("[" + type, array);
                    }
                case Operation.SET:
                    {
                        if (node.Children.Count <= 0)
                        {
                            return new Token("Err", "Expected at least 1 argument, received " + node.Children.Count);
                        }

                        var array = new TokenSet();
                        foreach (var child in node.Children)
                        {
                            array.Add(child.Output);
                        }
                        return new Token("{", array);
                    }
                case Operation.SUM:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsArray())
                        {
                            return new Token("Err", "Expected array as input, received " + node.Children[0].Output.Type);
                        }

                        var array = node.Children[0].Output.GetTokenList();
                        var agg = array.Sum(token => token.GetDouble());
                        return new Token(".", agg);

                    }
                case Operation.COS:
                case Operation.SIN:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }

                        // Set the binary operation
                        MathOp operation;
                        if (node.Operation == Operation.SIN)
                        {
                            operation = (value) => Math.Sin(value);
                        }
                        else if (node.Operation == Operation.COS)
                        {
                            operation = (value) => Math.Cos(value);
                        }
                        else
                        {
                            return new Token("Err", "Unknown math operation: " + node.Operation);
                        }

                        if (node.Children[0].Output.IsArray())
                        {
                            var array = node.Children[0].Output.GetTokenList();
                            var result = new List<Token>();
                            foreach (var token in array)
                            {
                                var calculate = operation(token.GetDouble());
                                result.Add(new Token(token.Type, calculate));
                            }
                            return new Token("[.", new ObjectList(result));
                        }
                        else if (node.Children[0].Output.IsNumeric())
                        {
                            var value = node.Children[0].Output.GetDouble();
                            var result = operation(value);
                            return new Token(".", result);
                        }
                        else
                        {
                            return new Token("Err", "Expected numeric or array argument, received " + node.Children[0].GetType().Name);
                        }
                    }
                case Operation.MEAN:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsArray())
                        {
                            return new Token("Err", "Expected array as input, received " + node.Children[0].Output.Type);
                        }

                        var array = node.Children[0].Output.GetTokenList();
                        var agg = array.Average(token => token.GetDouble());
                        return new Token(".", agg);

                    }
                case Operation.MAX:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsArray())
                        {
                            return new Token("Err", "Expected array as input, received " + node.Children[0].Output.Type);
                        }

                        var array = node.Children[0].Output.GetTokenList();
                        var agg = array.Max(token => token.GetDouble());
                        return new Token(".", agg);

                    }
                case Operation.MIN:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsArray())
                        {
                            return new Token("Err", "Expected array as input, received " + node.Children[0].Output.Type);
                        }

                        var array = node.Children[0].Output.GetTokenList();
                        var agg = array.Min(token => token.GetDouble());
                        return new Token(".", agg);

                    }
                case Operation.SORTASC:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsArray())
                        {
                            return new Token("Err", "Expected array as input, received " + node.Children[0].Output.Type);
                        }

                        var array = node.Children[0].Output.GetTokenList();
                        var agg = array.OrderBy(token => token.GetDouble()).ToList();
                        return new Token("[.", new ObjectList(agg));

                    }
                case Operation.SORTDESC:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsArray())
                        {
                            return new Token("Err", "Expected array as input, received " + node.Children[0].Output.Type);
                        }

                        var array = node.Children[0].Output.GetTokenList();
                        var agg = array.OrderByDescending(token => token.GetDouble()).ToList();
                        return new Token("[.", new ObjectList(agg));

                    }
                case Operation.LIMIT:
                    {
                        if (node.Children.Count != 2)
                        {
                            return new Token("Err", "Expected 2 arguments, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsArray())
                        {
                            return new Token("Err", "Expected array as second input, received " + node.Children[0].Output.Type);
                        }
                        else if (node.Children[1].Output.Type != "#")
                        {
                            return new Token("Err", "Expected integer as first, received " + node.Children[1].Output.Type);
                        }

                        var array = node.Children[0].Output.GetTokenList();
                        var limit = node.Children[1].Output.GetInteger();
                        var agg = array.Take(limit).ToList();
                        return new Token("[.", new ObjectList(agg));
                    }
                case Operation.UNION:
                    {
                        if (node.Children.Count != 2)
                        {
                            return new Token("Err", "Expected 2 arguments, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsSet() || !node.Children[1].Output.IsSet())
                        {
                            return new Token("Err", "Expected array as both inputs, received " + node.Children[0].Output.Type + ", " + node.Children[1].Output.Type);
                        }

                        var array1 = node.Children[0].Output.GetTokenSet();
                        var array2 = node.Children[1].Output.GetTokenSet();

                        var union = array1.Union(array2);
                        return new Token("{", union);
                    }
                case Operation.INTERSECT:
                    {
                        if (node.Children.Count != 2)
                        {
                            return new Token("Err", "Expected 2 arguments, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsSet() || !node.Children[1].Output.IsSet())
                        {
                            return new Token("Err", "Expected array as both inputs, received " + node.Children[0].Output.Type + ", " + node.Children[1].Output.Type);
                        }

                        var array1 = node.Children[0].Output.GetTokenSet();
                        var array2 = node.Children[1].Output.GetTokenSet();

                        var intersection = array1.Intersect(array2);
                        return new Token("{", intersection);
                    }
                case Operation.COUNTER:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (node.Children[0].Output.Type != "#")
                        {
                            return new Token("Err", "Expected integer argument, received " + node.Children.Count);
                        }

                        var milliseconds = node.Children[0].Output.GetInteger();

                        Counter counter;
                        if (node.Content == null)
                        {
                            node.Content = new Counter(milliseconds);
                            counter = node.Content as Counter;
                            counter.Flow = this;
                            counter.Node = node;
                            counter.Start();
                        }
                        counter = node.Content as Counter;
                        return new Token("#", counter.Ticks);
                    }
                case Operation.RANGE:
                    {
                        if (node.Children.Count != 3)
                        {
                            return new Token("Err", "Expected 3 arguments, received " + node.Children.Count);
                        }

                        var start = node.Children[0].Output.GetDouble();
                        var delta = node.Children[1].Output.GetDouble();
                        var end = node.Children[2].Output.GetDouble();

                        // TODO support negative deltas
                        if (delta < 0)
                        {
                            return new Token("Err", "Delta must be positive.");
                        }

                        double i = start;
                        var range = new ObjectList();

                        while (i <= end)
                        {
                            range.Add(new Token(".", i));
                            i += delta;
                        }

                        return new Token("[.", range);
                    }
                case Operation.BUTTON:
                    {

                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        /*
                        else if (node.Children[0].Output.Type != "\"" || node.Children[0].Output.Type != "#" || node.Children[0].Output.Type != ".")
                        {
                            return new Token("Err", "Expected string or number, got " + node.Children[0].Output.Type);
                        }*/

                        string content = "";
                        if (node.Children[0].Output.Type == "\"")
                        {
                            content = node.Children[0].Output.GetString();
                        }
                        else if (node.Children[0].Output.Type == "#" || node.Children[0].Output.Type == ".")
                        {
                            content = node.Children[0].Output.GetDouble().ToString();
                        }

                        // Make a button and set its text
                        var button = new GridButton();
                        button.Node = node;
                        button.Flow = this;
                        button.Content = content;

                        // Add button to canvas
                        var canvas = new Canvas();
                        canvas.Background = new SolidColorBrush(Windows.UI.Colors.White);
                        canvas.Width = button.Width;
                        canvas.Height = button.Height;
                        Canvas.SetLeft(button, 0);
                        Canvas.SetTop(button, 0);
                        canvas.Children.Add(button);
                        return new Token("B", canvas);
                    }
                case Operation.SUBMIT:
                    {

                        if (node.Children.Count <= 0)
                        {
                            return new Token("Err", "Expected at least 1 argument, received " + node.Children.Count);
                        }

                        // Get the string value in each of the input boxes
                        TokenList input_strings = new TokenList();
                        foreach (var child in node.Children)
                        {
                            var output = child.Output;
                            if (output.Type == "T")
                            {
                                var textbox_canvas = output.Value as Canvas;
                                var textbox = textbox_canvas.Children.ToList().Find(canvas_child => canvas_child.GetType().Name == "GridTextbox") as GridTextbox;
                                input_strings.Add(new Token("\"", textbox.Text));
                            }
                            else if (output.Type == "C")
                            {
                                var combobox_canvas = output.Value as Canvas;
                                var combobox = combobox_canvas.Children.ToList().Find(canvas_child => canvas_child.GetType().Name == "GridComboBox") as GridComboBox;
                                input_strings.Add(new Token("\"", combobox.SelectedValue.ToString()));
                            }
                            else
                            {
                                return new Token("ERR", "Expected UI Input arguments only");
                            }
                        }

                        // Make a button and set its text
                        var button = new GridSubmit();
                        button.Node = node;
                        button.Flow = this;
                        button.InputTokens = input_strings;
                       
                        // Add button to canvas
                        var canvas = new Canvas();
                        canvas.Background = new SolidColorBrush(Windows.UI.Colors.White);
                        canvas.Width = button.Width;
                        canvas.Height = button.Height;
                        Canvas.SetLeft(button, 0);
                        Canvas.SetTop(button, 0);
                        canvas.Children.Add(button);
                        return new Token("S", canvas);
                    }
                case Operation.TEXTBOX:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (node.Children[0].Output.Type != "\"")
                        {
                            return new Token("Err", "Expected a string argument, got " + node.Children[0].Output.Type);
                        }

                        string content = node.Children[0].Output.GetString();

                        // Make a textbox and set its placeholder text
                        var textbox = new GridTextbox();
                        textbox.Node = node;
                        textbox.Flow = this;
                        textbox.PlaceholderText = content;

                        // Add button to canvas
                        var canvas = new Canvas();
                        canvas.Background = new SolidColorBrush(Windows.UI.Colors.White);
                        canvas.Width = textbox.Width;
                        canvas.Height = textbox.Height;
                        Canvas.SetLeft(textbox, 0);
                        Canvas.SetTop(textbox, 0);
                        canvas.Children.Add(textbox);
                        return new Token("T", canvas);
                    }
                case Operation.COMBOBOX:
                    {
                        if (node.Children.Count != 1)
                        {
                            return new Token("Err", "Expected 1 argument, received " + node.Children.Count);
                        }
                        else if (node.Children[0].Output.Type != "{")
                        {
                            return new Token("Err", "Expected a set argument, got " + node.Children[0].Output.Type);
                        }

                        var list_items = node.Children[0].Output.GetTokenSet();

                        // Make a textbox and set its placeholder text
                        var listbox = new GridComboBox();
                        listbox.Node = node;
                        listbox.Flow = this;
                        foreach (var item in list_items.Set)
                        {
                            listbox.Items.Add(item.Value.ToString());
                        }
                        
                        // Add button to canvas
                        var canvas = new Canvas();
                        canvas.Background = new SolidColorBrush(Windows.UI.Colors.White);
                        canvas.Width = listbox.Width;
                        canvas.Height = listbox.Height;
                        Canvas.SetLeft(listbox, 0);
                        Canvas.SetTop(listbox, 0);
                        canvas.Children.Add(listbox);
                        return new Token("C", canvas);
                    }
                case Operation.GRAPH:
                    {
                        if (node.Children.Count != 2)
                        {
                            return new Token("Err", "Expected 2 arguments, received " + node.Children.Count);
                        }
                        else if (!node.Children[0].Output.IsArray() || !node.Children[1].Output.IsArray())
                        {
                            return new Token("Err", "Expected array arguments, received " + node.Children[0].Output.Type + " and " + node.Children[1].Output.Type);
                        }

                        var x = node.Children[0].Output.GetTokenList();
                        var y = node.Children[1].Output.GetTokenList();

                        if (x.Count != y.Count)
                        {
                            return new Token("Err", "X and Y must have same number of elements: X- " + x.Count + " Y- " + y.Count);
                        }

                        var scale_factor = 4;
                        var grid_size = 25;

                        // Create a new canvas to display the graph
                        var graph_canvas = new Canvas();
                        graph_canvas.Background = new SolidColorBrush(Windows.UI.Colors.White);

                        // Create a point collection from the input
                        var max_x = x.Max(token => token.GetDouble());
                        var min_x = x.Min(token => token.GetDouble());
                        var max_y = y.Max(token => token.GetDouble());
                        var min_y = y.Min(token => token.GetDouble());
                        var dx = max_x - min_x;
                        var dy = max_y - min_y;
                        var xypairs = x.Zip(y, (X, Y) => new Point(X.GetDouble() / max_x * (grid_size - 0) * scale_factor, Y.GetDouble() * -1 / max_y * (grid_size - 0) * scale_factor / 2));

                        var points = new PointCollection();
                        foreach (var point in xypairs)
                        {
                            points.Add(point);
                        }

                        // Add a shape to the canvas
                        var line = new Polyline();
                        line.StrokeThickness = 2;
                        line.Points = points;
                        line.Stroke = new SolidColorBrush(EveColors.Colors.EveMidBlue);
                        Canvas.SetTop(line, grid_size * scale_factor / 2);
                        Canvas.SetLeft(line, 0);
                        graph_canvas.Children.Add(line);
                        graph_canvas.Width = grid_size * scale_factor;
                        graph_canvas.Height = grid_size * scale_factor;

                        // Add a border to the canvas
                        var border = new Border();
                        border.Width = grid_size * scale_factor;
                        border.Height = grid_size * scale_factor;
                        border.BorderBrush = new SolidColorBrush(EveColors.Colors.EveMidPurple);
                        border.BorderThickness = new Thickness(2);
                        Canvas.SetTop(border, 0);
                        Canvas.SetLeft(border, 0);
                        graph_canvas.Children.Add(border);

                        return new Token("~", graph_canvas);
                    }
                case Operation.ERR:
                    return new Token("Err", "Encountered an error :(");
                default:
                    return new Token("Err", "Unknown token type: " + node.Operation);
            }
        }

        private class GridSubmit : Button
        {

            public DataflowNode Node;
            public DataflowNetwork Flow;
            public TokenList InputTokens;

            public GridSubmit()
            {
                this.Background = new SolidColorBrush(EveColors.Colors.EveMidBlue);
                this.BorderBrush = new SolidColorBrush(EveColors.Colors.EveDarkBlue);
                this.BorderThickness = new Thickness(2);
                this.Content = "Submit";
                this.Padding = new Thickness(0);
                this.FontSize = 12;
                this.Foreground = new SolidColorBrush(Windows.UI.Colors.White);
                this.Width = 75;
                this.Height = 25;
                this.Click += GridSubmit_Click;
                this.Tapped += GridSubmit_Tapped;
            }

            private void GridSubmit_Tapped(object sender, TappedRoutedEventArgs e)
            {
                e.Handled = true;
            }

            private void GridSubmit_Click(object sender, RoutedEventArgs e)
            {
                // Create a token list from the input strings
                foreach(var token in InputTokens)
                {
                    Debug.WriteLine(token);
                }
            }
        }

        private class GridTextbox : TextBox
        {
            public DataflowNode Node;
            public DataflowNetwork Flow;

            public GridTextbox()
            {
                var grid_size = 25;
                var scale = 5;
                this.Background = new SolidColorBrush(Windows.UI.Colors.White);
                this.Width = grid_size*scale;
                this.MaxWidth = grid_size * scale;
                this.MinWidth = grid_size * scale;
                this.MinHeight = grid_size;
                this.MaxHeight = grid_size;
                this.Height = grid_size;
                this.FontSize = 12;
                this.Text = "";
                this.PlaceholderText = "Type something here!";
                this.KeyDown += GridTextbox_KeyDown;
            }

            private void GridTextbox_KeyDown(object sender, KeyRoutedEventArgs e)
            {   /*
                if(!e.Handled)
                {
                    
                    if(e.Key == Windows.System.VirtualKey.Enter)
                    {
                        e.Handled = true;
                        this.Flow.MarkDirty(this.Node);
                        this.Flow.Compute();
                        this.PlaceholderText = this.Text;
                    }
                    else
                    {
                        return;
                    }
                }*/
            }
        }

        private class GridComboBox : ComboBox
        {
            public DataflowNode Node;
            public DataflowNetwork Flow;

            public GridComboBox()
            {
                var grid_size = 25;
                var scale = 5;
                this.Background = new SolidColorBrush(Windows.UI.Colors.White);
                this.Width = grid_size * scale;
                this.MaxWidth = grid_size * scale;
                this.MinWidth = grid_size * scale;
                this.MinHeight = grid_size;
                this.MaxHeight = grid_size;
                this.Height = grid_size;
                this.FontSize = 12;

                this.Tapped += GridComboBox_Tapped;
                //this.SelectionChanged += GridComboBox_SelectionChanged;
            }

            private void GridComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
            {
                foreach(var item in e.AddedItems)
                {
                    this.SelectedItem = item.ToString();
                }
                this.Flow.MarkDirty(this.Node);
                this.Flow.Compute();
            }

            private void GridComboBox_Tapped(object sender, TappedRoutedEventArgs e)
            {
                e.Handled = true;
            }
        }

        private class GridButton : Button
        {
            public DataflowNode Node;
            public DataflowNetwork Flow;

            public GridButton()
            {
                this.Background = new SolidColorBrush(EveColors.Colors.EveMidBlue);
                this.BorderBrush = new SolidColorBrush(EveColors.Colors.EveDarkBlue);
                this.BorderThickness = new Thickness(2);
                this.Content = "Eve!";
                this.Padding = new Thickness(0);
                this.FontSize = 12;
                this.Foreground = new SolidColorBrush(Windows.UI.Colors.White);
                this.Width = 75;
                this.Height = 25;
                this.Click += GridButton_Click;
                this.Tapped += GridButton_Tapped;
            }

            private void GridButton_Tapped(object sender, TappedRoutedEventArgs e)
            {
                e.Handled = true;
            }

            private void GridButton_Click(object sender, RoutedEventArgs e)
            {
                Debug.WriteLine("Click!");
            }
        }

        private class Counter : DispatcherTimer
        {
            public int Ticks = 0;
            public DataflowNetwork Flow;
            public DataflowNode Node;

            public Counter(int milliseconds)
            {
                this.Tick += Timer_Tick;
                this.Interval = new TimeSpan(0, 0, 0, 0, milliseconds);
            }

            private void Timer_Tick(object sender, object e)
            {
                this.Ticks++;
                this.Flow.MarkDirty(this.Node);
                this.Flow.Compute();
            }
        }

        private List<DataflowNode> FlattenAST(AST ast, object parent)
        {
            var network = new List<DataflowNode>();

            // If there are no children, we are at a leaf node.
            // Return a list with the node in it.
            if (ast.Children == null || ast.Children.Count == 0)
            {
                var leaf_node = new DataflowNode(ast);
                network.Add(leaf_node);
                return network;
            }
            // If there are children, create a list with each of them in it
            else
            {
                foreach (var child in ast.Children)
                {
                    network = network.Union(FlattenAST(child, null)).ToList();
                }
            }
            
            // Create the current node
            var node = new DataflowNode(ast);
            
            // Link the children to its parents and vice versa
            foreach(var n in network)
            {
                if(n.IsOutput())
                {
                    n.Parents = new List<DataflowNode>();
                    n.Parents.Add(node);
                    node.Children.Add(n);
                }
            }

            // Add the current node to the network
            network.Add(node);

            return network;
        }

        public override string ToString()
        {
            string return_string = "";
            foreach(var node in this.Network)
            {
                return_string += node.ToString();
            }
            return return_string;
        }
    }

    public sealed partial class MainPage : Page
    {
        // TODO calculate gridsize based on the size of the screen
        uint grid_size = 25;
        Parser parser = new Parser();
        DataflowNetwork flow = new DataflowNetwork();
        Cell EveGrid;
        
        public MainPage()
        {
            this.InitializeComponent();
            Regex.CacheSize = 30;

            // Create the main eve grid
            EveGrid = new Cell(grid_size);
            EveGrid.FillWindow();
            EveWindow.Children.Add(EveGrid);
            Debug.WriteLine("Program Loaded");
        }
        
        void DrawGridlines(CanvasControl sender, CanvasDrawEventArgs args)
        {
            var dash_style = new CanvasStrokeStyle();
            dash_style.CustomDashStyle = new float[2] { 10, 5 };
            float stroke_width = 0.5f;


            // Draw the gridlines on the canvas
            var window_height = 3000;
            var window_width = 3000;
            int i = 0;

            while (i * grid_size < window_height || i * grid_size < window_width)
            {
                // Draw horizontal gridlines
                if (i * grid_size < window_height)
                {
                    args.DrawingSession.DrawLine(0, i * grid_size, window_width, i * grid_size, Windows.UI.Colors.LightGray, stroke_width, dash_style);                    
                }

                // Draw vertical gridlines
                if (i * grid_size < window_width)
                {
                    args.DrawingSession.DrawLine(i*grid_size, 0, i*grid_size, window_height, Windows.UI.Colors.LightGray, stroke_width, dash_style);
                }
                i++;
            }
            
        }
    }
}